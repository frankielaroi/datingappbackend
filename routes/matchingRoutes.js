const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");
const GoogleUser = require("../models/googleUser.js")
const redis = require("redis");
const Bull = require("bull");
const { verifyToken } = require('../controllers/verifyToken.js')

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
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
  const scoreMap = {
    age: 10,
    gender: 10,
    location: 5,
    sexualOrientation: 10,
    relationshipType: 5,
    height: 5,
    bodyType: 5,
    smoking: 3,
    drinking: 3,
    exerciseFrequency: 3,
    religiousAffiliation: 2,
    politicalViews: 2,
    culturalBackground: 2,
    introversionExtraversion: 2,
    openness: 2,
    conscientiousness: 2,
    emotionalStability: 2,
    agreeableness: 2
  };

  for (const [key, value] of Object.entries(scoreMap)) {
    if (key === 'age') {
      if (potentialMatch.age >= userPrefs.minAge && potentialMatch.age <= userPrefs.maxAge) {
        score += value;
      }
    } else if (key === 'height') {
      if (potentialMatch.height >= userPrefs.minHeight && potentialMatch.height <= userPrefs.maxHeight) {
        score += value;
      }
    } else if (key === 'bodyType') {
      if (userPrefs.bodyTypes && userPrefs.bodyTypes.includes(potentialMatch.bodyType)) {
        score += value;
      }
    } else if (potentialMatch[key] === userPrefs[key]) {
      score += value;
    }
  }

  return score;
};

// Process the matching jobs
matchQueue.process(async (job) => {
  const { id, userPrefs } = job.data;

  // Construct the query to find matching users
  const potentialMatches = await User.find({
    $and: [
      { _id: { $ne: id } }, // Exclude the user's own data
      {
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
        ]
      }
    ]
  }).lean();

  // Calculate scores for each potential match and sort
  return potentialMatches
    .map(match => ({ match, score: calculateScore(userPrefs, match) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => item.match);
});

router.post("/api/match/", verifyToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const cachedData = await redisClient.get(`user:${id}`);
    let userPrefs;

    if (cachedData) {
      userPrefs = JSON.parse(cachedData);
    } else {
      const userPreferences = await Promise.all([
        User.findById(id, { matchPreferences: 1 }).lean(),
        GoogleUser.findById(id,{matchPreferences:1}).lean(),
      ])
        

      if (!userPreferences) {
        return res.status(404).json({ error: "User not found" });
      }

      userPrefs = userPreferences.matchPreferences || {};
      await redisClient.setEx(`user:${id}`, 3600, JSON.stringify(userPrefs));
    }

    const job = await matchQueue.add({ id, userPrefs });
    const result = await job.finished();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error finding matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;

// Handle graceful shutdown of Redis client
process.on('SIGINT', async () => {
  await redisClient.quit();
  console.log('Redis client disconnected');
  process.exit(0);
});
