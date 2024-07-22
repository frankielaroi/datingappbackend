const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");
const { isValidObjectId } = require("mongoose");
const GoogleUser = require("../models/googleUser")
const Bull = require("bull");
const Redis = require("ioredis");
const mongoose = require("mongoose");
const { verifyToken } = require("../controllers/verifyToken");

// Create a new Redis client
const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create a new Bull queue
const searchQueue = new Bull("search", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Route to search users by name or username
router.get("/api/search", verifyToken, async (req, res) => {
  try {
    const { query } = req.query;

    // Validate the query parameter
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Invalid search query" });
    }

    // Check if the search result is cached
    const cachedResult = await redisClient.get(`search:${query}`);
    if (cachedResult) {
      return res.status(200).json(JSON.parse(cachedResult));
    }

    // Use a regular expression to perform a case-insensitive search
    const users = await Promise.all([
      User.find({
        $or: [
          { firstName: { $regex: new RegExp(query, "i") } },
          { lastName: { $regex: new RegExp(query, "i") } },
          { username: { $regex: new RegExp(query, "i") } },
        ],
      }).lean().select('firstName lastName username'),
      GoogleUser.find({
        $or: [
          { displayName: { $regex: new RegExp(query, "i") } },
          { username: { $regex: new RegExp(query, "i") } },
        ],
      }).lean().select('displayName username'),
    ])

    // Cache the search result
    await redisClient.set(`search:${query}`, JSON.stringify(users), "EX", 3600); // Cache for 1 hour

    res.status(200).json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Process search requests in the background
searchQueue.process(async (job) => {
  const { query } = job.data;
  const users = await User.find({
    $or: [
      { firstName: { $regex: new RegExp(query, "i") } },
      { lastName: { $regex: new RegExp(query, "i") } },
      { username: { $regex: new RegExp(query, "i") } },
    ],
  }).lean().select('firstName lastName username');
  await redisClient.set(`search:${query}`, JSON.stringify(users), "EX", 3600);
  return users;
});

module.exports = router;

process.on('SIGINT', async () => {
  await redisClient.quit();
  await searchQueue.close();
  console.log('Redis client and Bull queue disconnected');
  process.exit(0);
});