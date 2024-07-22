const jwt = require("jsonwebtoken");
const formatMessage = require("../utils/message");
const {
  userJoin,
  userLeave,
  getCurrentUser,
  getRoomUsers,
} = require("../utils/user");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const Redis = require("ioredis");
const sanitize = require("sanitize-html");
const dotenv = require("dotenv");
dotenv.config();
const botName = "Frankie Socket";

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = function (io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
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

    socket.on("joinRoom", async ({ conversationId }) => {
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
            conversation.messages.map((message) =>
              formatMessage(message.sender, message.text, message.status)
            )
          );
        }

        if (offlineMessages.length > 0) {
          const parsedMessages = offlineMessages.map((msg) => {
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
      } catch (err) {
        console.error("Error fetching data:", err);
      }

      socket.on("chatMessage", async (msg) => {
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

          const recipientIds = conversation.participants.filter(
            (id) => id.toString() !== userId.toString()
          );

          const sendPromises = recipientIds.map(async (recipientId) => {
            const recipientSocket = findUserSocket(recipientId);
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
        } catch (err) {
          console.error("Error processing message:", err);
        }
      });

      socket.on("messageRead", async (messageId) => {
        try {
          const message = await Message.findByIdAndUpdate(messageId, { status: "read" }, { new: true });
          if (message) {
            io.to(room).emit("messageRead", messageId);
          }
        } catch (err) {
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

  function findUserSocket(userId) {
    const user = getCurrentUser(userId);
    return user ? io.sockets.sockets.get(user.socketId) : null;
  }

  process.on("SIGINT", async () => {
    await redisClient.quit();
    console.log("Redis client disconnected");
    process.exit(0);
  });
};
