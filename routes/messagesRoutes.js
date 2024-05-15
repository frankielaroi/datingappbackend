const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");
/*const { Server: SocketIOServer } = require("socket.io");

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
    console.log('message')

    // Save the message to the database
    await message.save();
    console.log('message saved')

    // Update the conversation with the new message ID
    await Conversation.findByIdAndUpdate(conversationId, {
      $push: { messages: message._id },
      $set: { updatedAt: Date.now() },
    });

    // Emit the new message to clients in the conversation room
    io.emit("newMessage", message);

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
});*/

// Define a POST route for sending messages
// I didn't see the socket.io request in my database
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
