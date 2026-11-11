import express from "express";
const router = express.Router();
import Post from "../models/postModel";
import { verifyToken } from '../controllers/verifyToken';

// Route: Create a new post with photo upload
router.post("/api/posts", verifyToken, async (req, res) => {
  const { content, images } = req.body;
  const userId = req.user.userId;

  if (!images || !content || !userId) {
    return res.status(400).json({ error: "UserId, content, and images are required for the post" });
  }

  try {
    const newPost = new Post({ userId, content, images });
    const savedPost = await newPost.save();
    res.status(201).json(savedPost);
  } catch (error: any) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route: Get a post by ID
router.get("/api/posts/:postId", verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId).populate("userId", "username");
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Get all posts
router.get("/api/posts", verifyToken, async (req, res) => {
  try {
    const posts = await Post.find().populate("userId", "username").lean();
    res.status(200).json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Update a post by ID
router.put("/api/posts/:postId", verifyToken, async (req, res) => {
  const { content } = req.body;

  try {
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.postId,
      { content },
      { new: true, runValidators: true }
    );
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(updatedPost);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Delete a post by ID
router.delete("/api/posts/:postId", verifyToken, async (req, res) => {
  try {
    const deletedPost = await Post.findByIdAndDelete(req.params.postId);
    if (!deletedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(deletedPost);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;