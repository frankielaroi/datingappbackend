import express from "express";
import mongoose from "mongoose";
import Post from "../models/postModel";
import PostLike from "../models/postLikeModel";
import PostComment from "../models/postCommentModel";
import PostShare from "../models/postShareModel";
import { verifyToken } from "../controllers/verifyToken";

const router = express.Router();

const DUPLICATE_KEY = 11000;

// Likes and shares are one row per user per post. Inserting a duplicate fails
// on the unique index, so the counter is only bumped for genuinely new rows.
async function addOnce(
  model: typeof PostLike | typeof PostShare,
  counter: "likesCount" | "sharesCount",
  postId: string,
  userId: string
): Promise<"added" | "duplicate" | "missing"> {
  if (!(await Post.exists({ _id: postId }))) return "missing";
  try {
    await model.create({ postId, userId });
  } catch (error: any) {
    if (error?.code === DUPLICATE_KEY) return "duplicate";
    throw error;
  }
  await Post.updateOne({ _id: postId }, { $inc: { [counter]: 1 } });
  return "added";
}

router.post("/api/comments", verifyToken, async (req, res) => {
  try {
    const { postId, content } = req.body;
    const userId = req.user.userId;
    if (!mongoose.isValidObjectId(postId) || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    if (!(await Post.exists({ _id: postId }))) {
      return res.status(404).json({ error: "Post not found" });
    }

    const comment = await PostComment.create({ postId, userId, content });
    await Post.updateOne({ _id: postId }, { $inc: { commentsCount: 1 } });
    res.status(201).json({ message: "Comment added successfully", comment });
  } catch (error: any) {
    if (error?.name === "ValidationError") return res.status(400).json({ error: error.message });
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/shares", verifyToken, async (req, res) => {
  try {
    const { postId } = req.body;
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const result = await addOnce(PostShare, "sharesCount", postId, req.user.userId);
    if (result === "missing") return res.status(404).json({ error: "Post not found" });
    if (result === "duplicate") return res.status(409).json({ error: "Post already shared" });
    res.status(201).json({ message: "Post shared successfully" });
  } catch (error: any) {
    console.error("Error sharing post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/likes", verifyToken, async (req, res) => {
  try {
    const { postId } = req.body;
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const result = await addOnce(PostLike, "likesCount", postId, req.user.userId);
    if (result === "missing") return res.status(404).json({ error: "Post not found" });
    if (result === "duplicate") return res.status(409).json({ error: "Post already liked" });
    res.status(201).json({ message: "Post liked successfully" });
  } catch (error: any) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/api/likes/:postId", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const { deletedCount } = await PostLike.deleteOne({ postId, userId: req.user.userId });
    if (!deletedCount) return res.status(404).json({ error: "Like not found" });
    await Post.updateOne({ _id: postId, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });
    res.status(200).json({ message: "Like removed" });
  } catch (error: any) {
    console.error("Error removing like:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
