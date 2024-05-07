const express = require("express");
const router = express.Router();
const Post = require("../models/postModel"); // Import the Post model

// Route: Create a new post with photo upload
router.post("/api/posts", async (req, res) => {
  const { userId, content, images } = req.body;

  try {
    if (!images) {
      return res
        .status(400)
        .json({ error: "Images are required for the post" });
    }
    if (!content) {
      return res
        .status(400)
        .json({ error: "Content is required for the post" });
    }
    if (!userId) {
      return res
        .status(400)
        .json({ error: "Author ID and content are required" });
    }

    const newPost = new Post({
      userId,
      content,
      images,
    });

    const savedPost = await newPost.save();

    res.status(201).json(savedPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route: Get a post by ID
router.get("/api/posts/:postId", async (req, res) => {
  const postId = req.params.postId;

  try {
    const post = await Post.findById(postId).populate("userId", "username");
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Get all posts
router.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.find().populate("userId", "username");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Update a post by ID
router.put("/api/posts/:postId", async (req, res) => {
  const postId = req.params.postId;
  const { content } = req.body;

  try {
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { content },
      { new: true }
    );
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(updatedPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Delete a post by ID
router.delete("/api/posts/:postId", async (req, res) => {
  const postId = req.params.postId;

  try {
    const deletedPost = await Post.findByIdAndDelete(postId);
    if (!deletedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(200).json(deletedPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
