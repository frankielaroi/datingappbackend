import express from "express";
import mongoose from "mongoose";
import Swipe, { SWIPE_ACTIONS, SwipeAction } from "../models/swipeModel";
import User from "../models/usermodel";
import Conversation from "../models/conversationModel";
import { verifyToken } from "../controllers/verifyToken";
import { removeFromList } from "../utils/matchStore";
import { swipeLimiter } from "../utils/rateLimit";
import { PRIVATE_FIELDS } from "../utils/userFields";

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Like or pass on someone. Swiping again on the same person changes the
// action. A like that is returned creates a match and a conversation.
router.post("/api/swipes", verifyToken, swipeLimiter, async (req, res) => {
  try {
    const me = String(req.user.userId);
    const { targetId, action } = req.body as { targetId?: string; action?: SwipeAction };

    if (!mongoose.isValidObjectId(targetId) || !SWIPE_ACTIONS.includes(action as SwipeAction)) {
      return res.status(400).json({ error: "targetId and action ('like' or 'pass') are required" });
    }
    if (targetId === me) {
      return res.status(400).json({ error: "You can't swipe on yourself" });
    }
    if (!(await User.exists({ _id: targetId }))) {
      return res.status(404).json({ error: "User not found" });
    }

    await Swipe.updateOne({ swiper: me, target: targetId }, { $set: { action } }, { upsert: true });
    await removeFromList(me, String(targetId));

    if (action !== "like") {
      return res.status(200).json({ matched: false });
    }
    const likedBack = await Swipe.exists({ swiper: targetId, target: me, action: "like" });
    if (!likedBack) {
      return res.status(200).json({ matched: false });
    }

    const participants = [me, String(targetId)];
    const conversation =
      (await Conversation.findOne({ participants: { $all: participants, $size: 2 } }).select("_id").lean()) ??
      (await Conversation.create({ participants }));
    res.status(200).json({ matched: true, conversationId: conversation._id });
  } catch (error: any) {
    console.error("Error recording swipe:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Mutual likes, most recent first. Pass `nextCursor` back as `?before=`.
router.get("/api/swipes/matches", verifyToken, async (req, res) => {
  try {
    const me = new mongoose.Types.ObjectId(String(req.user.userId));
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    const privateFields = Object.fromEntries(PRIVATE_FIELDS.split(" ").map((f) => [f.replace(/^-/, ""), 0]));

    const matches = await Swipe.aggregate([
      // Everyone who liked me...
      { $match: { target: me, action: "like", ...(before && !isNaN(before.getTime()) ? { updatedAt: { $lt: before } } : {}) } },
      { $sort: { updatedAt: -1 } },
      // ...that I liked back.
      {
        $lookup: {
          from: "swipes",
          let: { liker: "$swiper" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$swiper", me] }, { $eq: ["$target", "$$liker"] }, { $eq: ["$action", "like"] }] } } },
            { $limit: 1 },
          ],
          as: "likedBack",
        },
      },
      { $match: { "likedBack.0": { $exists: true } } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "swiper",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: privateFields }],
        },
      },
      { $unwind: "$user" },
      { $project: { _id: 0, user: 1, matchedAt: "$updatedAt" } },
    ]);

    res.status(200).json({
      matches,
      nextCursor: matches.length === limit ? matches[matches.length - 1].matchedAt : null,
    });
  } catch (error: any) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
