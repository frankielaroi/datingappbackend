// Route to like a post
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose")
const User = require("../models/usermodel");
const Post = require("../models/postModel");
const {verifyToken} = require('../controllers/verifyToken')

// Route to comment on a post
router.post("/api/comments",verifyToken, async (req, res) => {
  try {
    const { userId, postId, content} = req.body;

    // Validate userId, postId, and content
    if (!userId) {
      return res.status(400).json({ error: "Invalid request user" });
    }
    if (!postId) {
      return res.status(400).json({ error: "Invalid request post" });
    }
    if (!content) {
      return res.status(400).json({ error: "Invalid request content" });
    }

    // Find the post by postId
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Add the new comment to the post
    post.comments.push({  userId, content });
    await post.save();

    res.status(201).json({ message: "Comment added successfully" });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Sample request:
// {
//   "userId": "6456789abcdef012345678",
//   "postId": "6456789abcdef012345679",
//   "content": "This is a sample comment."
// }


// Route to share a post
router.post("/api/shares",verifyToken, async (req, res) => {
  try {
    const { userId, postId } = req.body;

    // Validate userId and postId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Check if the post is already shared
    if (post.shares.some((share) => share.userId.equals(userId))) {
      return res.status(400).json({ error: "Post already shared" });
    }

    // Add a new share
    post.shares.push({ userId });
    await post.save();

    res.status(201).json({ message: "Post shared successfully" });
  } catch (error) {
    console.error("Error sharing post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/likes",verifyToken, async (req, res) => {
  try {
    const { userId, postId } = req.body;

    // Validate userId and postId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Check if the post is already liked by the user
    if (post.likes.some((like) => like.equals(userId))) {
      return res.status(400).json({ error: "Post already liked" });
    }

    // Add a new like
    post.likes.push(userId); // Push the userId directly (assuming userId is a valid ObjectId)
    await post.save();

    res.status(201).json({ message: "Post liked successfully" });
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
