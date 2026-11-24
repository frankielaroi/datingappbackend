import express from "express";
import mongoose from "mongoose";
import Conversation from "../models/conversationModel";
import Message from "../models/messageModel";
import { verifyToken } from "../controllers/verifyToken";

const router = express.Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// Messages in a conversation the signed-in user belongs to, newest first.
// Pass `nextCursor` back as `?before=` to load older messages.
router.get("/api/messages", verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (typeof conversationId !== "string" || !mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "A valid conversationId is required" });
    }
    const isParticipant = await Conversation.exists({ _id: conversationId, participants: req.user.userId });
    if (!isParticipant) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    const filter: Record<string, unknown> = { conversationId };
    if (before && !isNaN(before.getTime())) filter.createdAt = { $lt: before };

    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.status(200).json({
      messages,
      nextCursor: messages.length === limit ? messages[messages.length - 1].createdAt : null,
    });
  } catch (error: any) {
    console.error("Error retrieving messages:", error);
    res.status(500).json({ error: "Failed to retrieve messages" });
  }
});

export default router;
