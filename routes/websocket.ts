import jwt from "jsonwebtoken";
import type { Server } from "socket.io";
import formatMessage from "../utils/message";
import {
  userJoin,
  userLeave,
  getCurrentUser,
  getRoomUsers,
} from "../utils/user";
import Conversation from "../models/conversationModel";
import Message from "../models/messageModel";
import Redis from "ioredis";
import sanitize from "sanitize-html";
import dotenv from "dotenv";
dotenv.config();
const botName = "Frankie Socket";

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

export default function (io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err: any, decoded: any) => {
        if (err) return next(new Error("Authentication error"));
        socket.decoded = decoded;
        next();
      });
    } else {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket.decoded;

    socket.on("joinRoom", async ({ conversationId }: { conversationId: string }) => {
      const room = conversationId;
      const user = userJoin(socket.id, userId, room);

      socket.join(user.room);

      try {
        const [conversation, offlineMessages] = await Promise.all([
          Conversation.findById(room).populate("messages").lean().exec(),
          redisClient.lrange(`offlineMessages:${userId}`, 0, -1),
        ]);

        if (conversation) {
          io.to(user.room).emit(
            "bulkMessages",
            (conversation.messages as any[]).map((message) =>
              formatMessage(message.sender, message.text, message.status)
            )
          );
        }

        if (offlineMessages.length > 0) {
          const parsedMessages = offlineMessages.map((msg: string) => {
            const parsedMsg = JSON.parse(msg);
            return formatMessage(parsedMsg.sender, parsedMsg.text, parsedMsg.status);
          });
          io.to(user.room).emit("bulkMessages", parsedMessages);
          await redisClient.del(`offlineMessages:${userId}`);
        }

        io.to(user.room).emit(
          "message",
          formatMessage(botName, `${userId} has joined the chat`)
        );
      } catch (err: any) {
        console.error("Error fetching data:", err);
      }

      socket.on("chatMessage", async (msg: string) => {
        try {
          const sanitizedMsg = sanitize(msg);
          const newMessage = new Message({
            conversationId: room,
            sender: userId,
            text: sanitizedMsg,
            status: "sent",
          });

          const [savedMessage, conversation] = await Promise.all([
            newMessage.save(),
            Conversation.findByIdAndUpdate(
              room,
              { $push: { messages: newMessage._id } },
              { new: true }
            ).lean().exec(),
          ]);

          const recipientIds = (conversation?.participants ?? []).filter(
            (id) => id.toString() !== userId.toString()
          );

          const sendPromises = recipientIds.map(async (recipientId) => {
            const recipientSocket = findUserSocket(recipientId.toString());
            if (recipientSocket) {
              io.to(recipientSocket.id).emit(
                "message",
                formatMessage(userId, sanitizedMsg, "delivered")
              );
              await redisClient.del(`offlineMessages:${recipientId}`);
            } else {
              await redisClient.rpush(
                `offlineMessages:${recipientId}`,
                JSON.stringify({ sender: userId, text: sanitizedMsg, status: "sent" })
              );
            }
          });

          await Promise.all(sendPromises);

          io.to(user.room).emit("message", formatMessage(userId, sanitizedMsg, "delivered"));
        } catch (err: any) {
          console.error("Error processing message:", err);
        }
      });

      socket.on("messageRead", async (messageId: string) => {
        try {
          const message = await Message.findByIdAndUpdate(messageId, { status: "read" }, { new: true });
          if (message) {
            io.to(room).emit("messageRead", messageId);
          }
        } catch (err: any) {
          console.error("Error marking message as read:", err);
        }
      });

      socket.on("typing", () => {
        socket.broadcast.to(user.room).emit("typing", userId);
      });

      socket.on("stopTyping", () => {
        socket.broadcast.to(user.room).emit("stopTyping", userId);
      });

      socket.on("disconnect", () => {
        const user = userLeave(socket.id);
        if (user) {
          io.to(user.room).emit(
            "message",
            formatMessage(botName, `${userId} has left the chat`)
          );
        }
      });
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection:", reason);
    });
  });

  function findUserSocket(userId: string) {
    const user = getCurrentUser(userId);
    return user ? io.sockets.sockets.get(user.id) : null;
  }

  process.on("SIGINT", async () => {
    await redisClient.quit();
    console.log("Redis client disconnected");
    process.exit(0);
  });
};
