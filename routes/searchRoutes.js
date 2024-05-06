const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");
const { isValidObjectId } = require("mongoose");

// Route to search users by name or username
router.get("/api/search", async (req, res) => {
  try {
    const { query } = req.query;

    // Validate the query parameter
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Invalid search query" });
    }

    // Use a regular expression to perform a case-insensitive search
    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } },
      ],
    });

    res.status(200).json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
