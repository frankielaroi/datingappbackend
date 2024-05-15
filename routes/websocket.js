const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");
const { Server: SocketIOServer } = require("socket.io");
const socketServer = new SocketIOServer();
const io = socketServer.of("/");
const jwt = require("jsonwebtoken");

// Handle WebSocket connections
module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("joinConversation", async (conversationId) => {
      socket.join(conversationId);
      console.log(`Client joined conversation: ${conversationId}`);
    });

    socket.on("sendMessage", async (data) => {
      try {
        const { conversationId, text } = data;
        const token = socket.handshake.headers.token;
        const userId = jwt.verify(token, process.env.JWT_SECRET).userId;
        const message = new Message({
          conversationId,
          sender: userId,
          text,
        });

        // Save the message to the database
        const savedMessage = await message.save();

        // Update the conversation with the new message ID
        const conversation = await Conversation.findByIdAndUpdate(
          conversationId,
          {
            $push: { messages: savedMessage._id },
            $set: { updatedAt: Date.now() },
          },
          { new: true }
        );

        // Emit the new message to clients in the conversation room
        io.to(conversationId).emit("newMessage", savedMessage);

        console.log("Message sent successfully");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });
};
