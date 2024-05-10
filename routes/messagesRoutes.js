const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");
const zmq = require("zeromq");
const redis = require("redis");
const { Server: SocketIOServer } = require("socket.io");

// ZeroMQ Publisher setup
const publisher = new zmq.Publisher();
const ZMQ_URL = process.env.ZMQ_URL || "tcp://127.0.0.1:5555";

// Use bind instead of bindSync to asynchronously bind the socket
publisher.bind(ZMQ_URL).then(() => {
  console.log(`ZeroMQ Publisher bound to ${ZMQ_URL}`);
}).catch((err) => {
  console.error("Failed to bind ZeroMQ Publisher:", err);
  process.exit(1); // Exit process if binding fails
});

// Create Redis client
const REDIS_PORT = 6379;
const redisClient = redis.createClient(REDIS_PORT);

// Initialize Socket.IO server
const socketServer = new SocketIOServer();
const io = socketServer.of("/");

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("sendMessage", async (data) => {
    try {
      const { conversationId, text } = data;
      const message = new Message({
        conversationId,
        sender: socket.request.user.userId,
        text,
      });

      await message.save();

      // Publish message using ZeroMQ
      const messagePayload = JSON.stringify({
        conversationId,
        sender: message.sender,
        text: message.text,
      });
      publisher.send([conversationId, messagePayload]);

      // Update conversation with the new message
      await Conversation.findByIdAndUpdate(conversationId, {
        $push: { messages: message._id },
      });

      // Emit new message to all clients in the conversation room
      io.to(conversationId).emit("newMessage", message);

      // Cache the message using Redis
      const cacheKey = `conversation:${conversationId}`;
      redisClient.hset(
        cacheKey,
        message._id.toString(),
        JSON.stringify(message)
      );

      // Expire cache key after a certain time (e.g., 1 hour)
      redisClient.expire(cacheKey, 3600);

      console.log("Message sent successfully");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`Client joined conversation: ${conversationId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Define a POST route for sending messages
router.post("/api/message", verifyToken, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const message = new Message({
      conversationId,
      sender: req.user.userId,
      text,
    });

    await message.save();

    // Emit event to join conversation room
    io.to(conversationId).emit("joinConversation", conversationId);

    // Emit event to send message
    io.to(conversationId).emit("sendMessage", {
      conversationId,
      sender: req.user.userId,
      text,
    });

    res.status(200).send("Message sent successfully");
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
