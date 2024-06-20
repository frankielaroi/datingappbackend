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

// Scoring function
const calculateScore = (userPrefs, potentialMatch) => {
  let score = 0;

  if (potentialMatch.age >= userPrefs.minAge && potentialMatch.age <= userPrefs.maxAge) {
    score += 10;
  }
  if (potentialMatch.gender === userPrefs.gender) {
    score += 10;
  }
  if (potentialMatch.location === userPrefs.location) {
    score += 5;
  }
  if (potentialMatch.sexualOrientation === userPrefs.sexualOrientation) {
    score += 10;
  }
  if (potentialMatch.relationshipType === userPrefs.relationshipType) {
    score += 5;
  }
  if (potentialMatch.height >= userPrefs.minHeight && potentialMatch.height <= userPrefs.maxHeight) {
    score += 5;
  }
  if (userPrefs.bodyTypes && userPrefs.bodyTypes.includes(potentialMatch.bodyType)) {
    score += 5;
  }
  if (potentialMatch.smoking === userPrefs.smoking) {
    score += 3;
  }
  if (potentialMatch.drinking === userPrefs.drinking) {
    score += 3;
  }
  if (potentialMatch.exerciseFrequency === userPrefs.exerciseFrequency) {
    score += 3;
  }
  if (potentialMatch.religiousAffiliation === userPrefs.religiousAffiliation) {
    score += 2;
  }
  if (potentialMatch.politicalViews === userPrefs.politicalViews) {
    score += 2;
  }
  if (potentialMatch.culturalBackground === userPrefs.culturalBackground) {
    score += 2;
  }
  if (potentialMatch.introversionExtraversion === userPrefs.introversionExtraversion) {
    score += 2;
  }
  if (potentialMatch.openness === userPrefs.openness) {
    score += 2;
  }
  if (potentialMatch.conscientiousness === userPrefs.conscientiousness) {
    score += 2;
  }
  if (potentialMatch.emotionalStability === userPrefs.emotionalStability) {
    score += 2;
  }
  if (potentialMatch.agreeableness === userPrefs.agreeableness) {
    score += 2;
  }

  return score;
};

// Process the matching jobs
matchQueue.process(async (job) => {
  const { id, userPrefs } = job.data;

  // Construct the query to find matching users
  const potentialMatches = await User.find({
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

  // Calculate scores for each potential match
  const scoredMatches = potentialMatches.map((match) => {
    const score = calculateScore(userPrefs, match);
    return { match, score };
  });

  // Sort matches by score in descending order
  scoredMatches.sort((a, b) => b.score - a.score);

  // Return top 10 matches
  return scoredMatches.slice(0, 10).map((item) => item.match);
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
