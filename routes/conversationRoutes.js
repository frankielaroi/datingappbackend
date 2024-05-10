const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");

// Create a new conversation
router.post("/api/conversations", verifyToken, async (req, res) => {
  try {
    const { participants } = req.body;

    // Ensure participants array is provided and contains valid user IDs
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ error: "Participants array must contain at least two user IDs" });
    }

    const conversation = new Conversation({ participants });
    await conversation.save();

    res.status(201).json(conversation);
  } catch (err) {
    console.error("Error creating conversation:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get all conversations for a user
router.get("/api/conversations", verifyToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // Retrieve conversations where the user is a participant
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "_id username")
      .populate({
        path: "messages",
        populate: { path: "sender", select: "_id username" },
      })
      .sort({ updatedAt: -1 }) // Sort conversations by updatedAt in descending order
      .exec();

    res.status(200).json(conversations);
  } catch (err) {
    console.error("Error retrieving conversations:", err);
    res.status(500).json({ error: "Failed to retrieve conversations" });
  }
});

module.exports = router;
