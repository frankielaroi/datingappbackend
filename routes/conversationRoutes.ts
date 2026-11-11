import express from "express";
const router = express.Router();
import Conversation from "../models/conversationModel";
import { verifyToken } from "../controllers/verifyToken";

// Create a new conversation
router.post("/api/conversations", verifyToken, async (req, res) => {
  try {
    const { userId } = req.user; // Sender's ID from the verified token
    const { participants } = req.body;

    if (!Array.isArray(participants) || participants.length < 1) {
      return res.status(400).json({ error: "Participants array must contain at least one user ID" });
    }

    // Include the sender's ID in the participants array
    const allParticipants = [userId, ...participants];

    const conversation = await Conversation.create({ participants: allParticipants });
    res.status(201).json(conversation);
  } catch (err: any) {
    console.error("Error creating conversation:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get all conversations for a user
router.get("/api/conversations", verifyToken, async (req, res) => {
  try {
    const { userId } = req.user;

    const conversations = await Conversation.aggregate([
      { $match: { participants: userId } },
      { $sort: { updatedAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "participants"
        }
      },
      { $project: { "participants._id": 1, "participants.username": 1 } },
      {
        $lookup: {
          from: "messages",
          let: { conversationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$conversationId", "$$conversationId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $lookup: {
                from: "users",
                localField: "sender",
                foreignField: "_id",
                as: "sender"
              }
            },
            { $unwind: "$sender" },
            { $project: { "sender._id": 1, "sender.username": 1, content: 1, createdAt: 1 } }
          ],
          as: "lastMessage"
        }
      },
      { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } }
    ]);

    res.status(200).json(conversations);
  } catch (err: any) {
    console.error("Error retrieving conversations:", err);
    res.status(500).json({ error: "Failed to retrieve conversations" });
  }
});

export default router;