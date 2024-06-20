const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");
const redis = require("redis");
const Bull = require("bull");

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

// Ensure Redis client is connected
redisClient.connect().catch(console.error);

// Set up a Bull queue
const matchQueue = new Bull('matchQueue', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

// Process the matching jobs
matchQueue.process(async (job) => {
  const { id, userPrefs } = job.data;

  // Construct the query to find matching users
  const matches = await User.find({
    $or: [
      { age: { $gte: userPrefs.minAge || 0, $lte: userPrefs.maxAge || 100 } },
      { gender: userPrefs.gender },
      { location: userPrefs.location },
      { sexualOrientation: userPrefs.sexualOrientation },
      { relationshipType: userPrefs.relationshipType },
      {
        height: {
          $gte: userPrefs.minHeight || 0,
          $lte: userPrefs.maxHeight || 250,
        },
      },
      { bodyType: { $in: userPrefs.bodyTypes || [] } },
      { smoking: userPrefs.smoking },
      { drinking: userPrefs.drinking },
      { exerciseFrequency: userPrefs.exerciseFrequency },
      { religiousAffiliation: userPrefs.religiousAffiliation },
      { politicalViews: userPrefs.politicalViews },
      { culturalBackground: userPrefs.culturalBackground },
      { introversionExtraversion: userPrefs.introversionExtraversion },
      { openness: userPrefs.openness },
      { conscientiousness: userPrefs.conscientiousness },
      { emotionalStability: userPrefs.emotionalStability },
      { agreeableness: userPrefs.agreeableness },
    ],
    _id: { $ne: id }, // Exclude the user's own data
  });

  if (matches.length === 0) {
    const availablePeople = await User.find(
      { _id: { $ne: id } },
      { _id: 0, preferences: 1 }
    ); // Exclude the user's own data
    return availablePeople;
  } else {
    return matches.slice(0, 10);
  }
});

router.post("/api/match/", async (req, res) => {
  try {
    const { id } = req.body; // Extract id from request body

    // Validate the request body
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if user preferences are cached in Redis
    const cachedData = await redisClient.get(`user:${id}`);
    let userPrefs;

    if (cachedData) {
      // User preferences found in cache
      userPrefs = JSON.parse(cachedData);
    } else {
      // User preferences not found in cache, fetch from database
      const userPreferences = await User.findById(id).lean();

      // Check if user preferences exist
      if (!userPreferences) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure that user preferences are retrieved and fallback to an empty object if not found
      userPrefs = userPreferences?.matchPreferences || {};

      // Cache user preferences in Redis
      await redisClient.setEx(`user:${id}`, 3600, JSON.stringify(userPrefs));
    }

    // Add job to Bull queue
    const job = await matchQueue.add({ id, userPrefs });

    // Wait for the job to complete
    const result = await job.finished();

    res.status(200).json(result);
  } catch (error) {
    console.error("Error finding matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;

// Handle graceful shutdown of Redis client
process.on('SIGINT', () => {
  redisClient.quit().then(() => {
    console.log('Redis client disconnected');
    process.exit(0);
  });
});
