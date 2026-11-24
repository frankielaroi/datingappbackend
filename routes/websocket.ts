import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import type { Server, Socket } from "socket.io";
import sanitize from "sanitize-html";
import formatMessage from "../utils/message";
import Conversation from "../models/conversationModel";
import Message from "../models/messageModel";
import { redisClient } from "../utils/redis";

/**
 * Real-time chat. Works across several server instances: the Socket.IO Redis
 * adapter (set up in server.ts) delivers room emits to sockets on every
 * instance, and each socket joins a personal `user:<id>` room so anyone can
 * be reached, or checked for being online, from any instance.
 */

const botName = "Frankie Socket";
const HISTORY_SIZE = 50;
const MAX_MESSAGE_LENGTH = 1000;
const OFFLINE_QUEUE_LIMIT = 500;

const userRoom = (userId: string) => `user:${userId}`;
const offlineKey = (userId: string) => `offlineMessages:${userId}`;

async function isOnline(io: Server, userId: string) {
  return (await io.in(userRoom(userId)).fetchSockets()).length > 0;
}

export default function websocket(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, process.env.JWT_SECRET, (err: any, decoded: any) => {
      if (err) return next(new Error("Authentication error"));
      socket.decoded = decoded;
      next();
    });
  });

  io.on("connection", (socket: Socket) => {
    const userId = String(socket.decoded.userId);
    socket.join(userRoom(userId));
    // The conversation most recently joined; used when a client sends a plain
    // string message without saying which conversation it's for.
    let currentRoom: string | null = null;

    const inRoom = (room: unknown): room is string => typeof room === "string" && socket.rooms.has(room);

    socket.on("joinRoom", async ({ conversationId }: { conversationId: string }) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) return;
        // Only participants may join a conversation.
        const allowed = await Conversation.exists({ _id: conversationId, participants: userId });
        if (!allowed) {
          socket.emit("error", { error: "Conversation not found" });
          return;
        }
        socket.join(conversationId);
        currentRoom = conversationId;

        const [history, offline] = await Promise.all([
          Message.find({ conversationId }).sort({ createdAt: -1 }).limit(HISTORY_SIZE).lean(),
          redisClient.lRange(offlineKey(userId), 0, -1),
        ]);
        socket.emit(
          "bulkMessages",
          history.reverse().map((m) => formatMessage(String(m.sender), m.text, m.status ?? undefined))
        );
        if (offline.length) {
          socket.emit(
            "bulkMessages",
            offline.map((raw) => {
              const m = JSON.parse(raw);
              return formatMessage(m.sender, m.text, m.status);
            })
          );
          await redisClient.del(offlineKey(userId));
        }
        io.to(conversationId).emit("message", formatMessage(botName, `${userId} has joined the chat`));
      } catch (err: any) {
        console.error("Error joining conversation:", err);
      }
    });

    // Accepts { conversationId, text } or, for older clients, a plain string
    // sent to the conversation joined last.
    socket.on("chatMessage", async (payload: string | { conversationId: string; text: string }) => {
      try {
        const room = typeof payload === "string" ? currentRoom : payload?.conversationId;
        const raw = typeof payload === "string" ? payload : payload?.text;
        if (!inRoom(room) || typeof raw !== "string") return;
        const text = sanitize(raw).trim();
        if (!text || text.length > MAX_MESSAGE_LENGTH) return;

        await Message.create({ conversationId: room, sender: userId, text, status: "sent" });
        const conversation = await Conversation.findByIdAndUpdate(
          room,
          { $set: { lastMessageAt: new Date() } },
          { new: true }
        ).lean();

        const outgoing = formatMessage(userId, text, "delivered");
        io.to(room).emit("message", outgoing);

        const recipients = (conversation?.participants ?? []).map(String).filter((id) => id !== userId);
        await Promise.all(
          recipients.map(async (recipientId) => {
            if (await isOnline(io, recipientId)) {
              // Online but not looking at this conversation: notify them anyway.
              io.to(userRoom(recipientId)).except(room).emit("message", outgoing);
            } else {
              await redisClient
                .multi()
                .rPush(offlineKey(recipientId), JSON.stringify({ sender: userId, text, status: "sent" }))
                .lTrim(offlineKey(recipientId), -OFFLINE_QUEUE_LIMIT, -1)
                .exec();
            }
          })
        );
      } catch (err: any) {
        console.error("Error processing message:", err);
      }
    });

    socket.on("messageRead", async (messageId: string) => {
      try {
        if (!mongoose.isValidObjectId(messageId)) return;
        const message = await Message.findById(messageId).select("conversationId").lean();
        const room = message ? String(message.conversationId) : null;
        if (!inRoom(room)) return;
        await Message.updateOne({ _id: messageId }, { $set: { status: "read" } });
        io.to(room).emit("messageRead", messageId);
      } catch (err: any) {
        console.error("Error marking message as read:", err);
      }
    });

    socket.on("typing", () => {
      if (currentRoom) socket.broadcast.to(currentRoom).emit("typing", userId);
    });

    socket.on("stopTyping", () => {
      if (currentRoom) socket.broadcast.to(currentRoom).emit("stopTyping", userId);
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room !== socket.id && room !== userRoom(userId)) {
          io.to(room).emit("message", formatMessage(botName, `${userId} has left the chat`));
        }
      }
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });
  });
}
