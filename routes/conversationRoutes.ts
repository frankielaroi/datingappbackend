import express from "express";
import mongoose from "mongoose";
import Conversation from "../models/conversationModel";
import User from "../models/usermodel";
import { verifyToken } from "../controllers/verifyToken";

const router = express.Router();

const MAX_PARTICIPANTS = 20;
const PAGE_SIZE = 50;

// Create a conversation between the signed-in user and the given users.
router.post("/api/conversations", verifyToken, async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const { participants } = req.body;

    if (!Array.isArray(participants) || participants.length < 1 || participants.length > MAX_PARTICIPANTS) {
      return res.status(400).json({ error: `Participants must list 1 to ${MAX_PARTICIPANTS} user IDs` });
    }
    if (!participants.every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ error: "Participants must be valid user IDs" });
    }

    const allParticipants = [...new Set([userId, ...participants.map(String)])];
    const existing = await User.countDocuments({ _id: { $in: allParticipants } });
    if (existing !== allParticipants.length) {
      return res.status(400).json({ error: "One or more participants don't exist" });
    }

    const conversation = await Conversation.create({ participants: allParticipants });
    res.status(201).json(conversation);
  } catch (err: any) {
    console.error("Error creating conversation:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// The signed-in user's conversations, most recently active first, each with
// its participants and last message.
router.get("/api/conversations", verifyToken, async (req, res) => {
  try {
    // Aggregation doesn't cast types, so the id must be an ObjectId to match.
    const userId = new mongoose.Types.ObjectId(String(req.user.userId));

    const conversations = await Conversation.aggregate([
      { $match: { participants: userId } },
      { $sort: { lastMessageAt: -1, updatedAt: -1 } },
      { $limit: PAGE_SIZE },
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "participants",
          pipeline: [{ $project: { username: 1, profilePicture: 1 } }],
        },
      },
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
                as: "sender",
                pipeline: [{ $project: { username: 1 } }],
              },
            },
            { $unwind: "$sender" },
            { $project: { sender: 1, text: 1, status: 1, createdAt: 1 } },
          ],
          as: "lastMessage",
        },
      },
      { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
    ]);

    res.status(200).json(conversations);
  } catch (err: any) {
    console.error("Error retrieving conversations:", err);
    res.status(500).json({ error: "Failed to retrieve conversations" });
  }
});

export default router;
