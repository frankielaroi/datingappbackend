// Route to like a post
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/usermodel");
const Post = require("../models/postModel");
const { verifyToken } = require('../controllers/verifyToken');

// Route to comment on a post
router.post("/api/comments", verifyToken, async (req, res) => {
  try {
    const { postId, content } = req.body;
    const { userId } = req.user.userId

    // Validate userId, postId, and content
    if (!userId || !postId || !content) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    // Find the post by postId and update it in one operation
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $push: { comments: { userId, content } } },
      { new: true, runValidators: true }
    );

    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.status(201).json({ message: "Comment added successfully" });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to share a post
router.post("/api/shares", verifyToken, async (req, res) => {
  try {
    const { userId, postId } = req.body;

    // Validate userId and postId, and update post in one operation
    const updatedPost = await Post.findOneAndUpdate(
      { _id: postId, 'shares.userId': { $ne: userId } },
      { $addToSet: { shares: { userId } } },
      { new: true, runValidators: true }
    );

    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found or already shared" });
    }

    res.status(201).json({ message: "Post shared successfully" });
  } catch (error) {
    console.error("Error sharing post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/likes", verifyToken, async (req, res) => {
  try {
    const {  postId } = req.body;
    const userId = req.user.UserId;
    // Validate userId and postId, and update post in one operation
    const updatedPost = await Post.findOneAndUpdate(
      { _id: postId, likes: { $ne: userId } },
      { $addToSet: { likes: userId } },
      { new: true, runValidators: true }
    );

    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found or already liked" });
    }

    res.status(201).json({ message: "Post liked successfully" });
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
