import express from "express";
import User from "../models/usermodel";
import { verifyToken } from "../controllers/verifyToken";
import { searchLimiter } from "../utils/rateLimit";
import { redisClient } from "../utils/redis";

const router = express.Router();

const MIN_QUERY = 2;
const MAX_QUERY = 50;
const MAX_RESULTS = 20;
const CACHE_SECONDS = 300;

// User input is matched literally: regex special characters are escaped so a
// crafted query can't run an expensive pattern against the whole collection.
const literal = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

// Search people by name or username.
router.get("/api/search", verifyToken, searchLimiter, async (req, res) => {
  try {
    const raw = req.query.query;
    const query = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
      return res.status(400).json({ error: `Search must be ${MIN_QUERY} to ${MAX_QUERY} characters` });
    }

    const cacheKey = `search:${query}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const pattern = literal(query);
    const users = await User.find({
      $or: [{ firstName: pattern }, { lastName: pattern }, { displayName: pattern }, { username: pattern }],
    })
      .select("firstName lastName displayName username profilePicture")
      .limit(MAX_RESULTS)
      .lean();

    await redisClient.set(cacheKey, JSON.stringify(users), { EX: CACHE_SECONDS });
    res.status(200).json(users);
  } catch (error: any) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
