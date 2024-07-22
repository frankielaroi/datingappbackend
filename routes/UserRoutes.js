const express = require("express");
const User = require("../models/usermodel");
const GoogleUser = require("../models/googleUser");
const { verifyToken } = require('../controllers/verifyToken');

const router = express.Router();
router.use(express.json());

// Fetch all users from both models
router.get("/api/users", verifyToken, async (req, res) => {
  try {
    const [users, googleUsers] = await Promise.all([
      User.find().select('-__v').lean(),
      GoogleUser.find().select('-__v').lean()
    ]);
    const allUsers = [...users, ...googleUsers];
    res.status(200).json(allUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch a single user by ID from both models
router.get("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-__v').lean();
    if (user) {
      return res.status(200).json(user);
    }
    const googleUser = await GoogleUser.findById(req.params.id).select('-__v').lean();
    if (googleUser) {
      return res.status(200).json(googleUser);
    }
    res.status(404).json({ error: "User not found" });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update an existing user by ID from both models
router.put("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
      select: '-__v'
    });
    if (user) {
      return res.status(200).json(user);
    }
    const googleUser = await GoogleUser.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
      select: '-__v'
    });
    if (googleUser) {
      return res.status(200).json(googleUser);
    }
    res.status(404).json({ error: "User not found" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete an existing user by ID from both models
router.delete("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) {
      return res.status(200).json({ message: "User deleted successfully" });
    }
    const googleUser = await GoogleUser.findByIdAndDelete(req.params.id);
    if (googleUser) {
      return res.status(200).json({ message: "User deleted successfully" });
    }
    res.status(404).json({ error: "User not found" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
