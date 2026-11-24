import express from "express";
import mongoose from "mongoose";
import Post from "../models/postModel";
import PostLike from "../models/postLikeModel";
import PostComment from "../models/postCommentModel";
import PostShare from "../models/postShareModel";
import { verifyToken } from "../controllers/verifyToken";

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const pageSize = (raw: unknown) =>
  Math.min(Math.max(Number(raw) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

// Create a post
router.post("/api/posts", verifyToken, async (req, res) => {
  const { content, images } = req.body;
  const userId = req.user.userId;

  if (!images || !content) {
    return res.status(400).json({ error: "Content and images are required for the post" });
  }

  try {
    const savedPost = await Post.create({ userId, content, images });
    res.status(201).json(savedPost);
  } catch (error: any) {
    if (error?.name === "ValidationError") return res.status(400).json({ error: error.message });
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get one post
router.get("/api/posts/:postId", verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const post = await Post.findById(req.params.postId).populate("userId", "username profilePicture").lean();
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(post);
  } catch (error: any) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Feed, newest first. Pass `nextCursor` back as `?before=` for the next page.
router.get("/api/posts", verifyToken, async (req, res) => {
  try {
    const limit = pageSize(req.query.limit);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    if (before && isNaN(before.getTime())) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    const posts = await Post.find(before ? { createdAt: { $lt: before } } : {})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "username profilePicture")
      .lean();
    res.status(200).json({
      posts,
      nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt : null,
    });
  } catch (error: any) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Comments on a post, newest first (cursor as above).
router.get("/api/posts/:postId/comments", verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const limit = pageSize(req.query.limit);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    const filter: Record<string, unknown> = { postId: req.params.postId };
    if (before && !isNaN(before.getTime())) filter.createdAt = { $lt: before };

    const comments = await PostComment.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "username profilePicture")
      .lean();
    res.status(200).json({
      comments,
      nextCursor: comments.length === limit ? comments[comments.length - 1].createdAt : null,
    });
  } catch (error: any) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Only the author can edit their post.
router.put("/api/posts/:postId", verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const updatedPost = await Post.findOneAndUpdate(
      { _id: req.params.postId, userId: req.user.userId },
      { $set: { content: req.body.content } },
      { new: true, runValidators: true }
    );
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(updatedPost);
  } catch (error: any) {
    if (error?.name === "ValidationError") return res.status(400).json({ error: error.message });
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Only the author can delete their post; its likes, comments and shares go with it.
router.delete("/api/posts/:postId", verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ error: "Invalid post id" });
    }
    const deletedPost = await Post.findOneAndDelete({ _id: req.params.postId, userId: req.user.userId });
    if (!deletedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    const postId = deletedPost._id;
    await Promise.all([
      PostLike.deleteMany({ postId }),
      PostComment.deleteMany({ postId }),
      PostShare.deleteMany({ postId }),
    ]);
    res.status(200).json(deletedPost);
  } catch (error: any) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
