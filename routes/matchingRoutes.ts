import express from "express";
import { verifyToken } from "../controllers/verifyToken";
import { matchLimiter } from "../utils/rateLimit";
import { findRequester } from "../utils/matching";
import { getMatches } from "../utils/matchStore";

const router = express.Router();

router.post("/api/match/", verifyToken, matchLimiter, async (req, res) => {
  try {
    const id: string | undefined = req.user?.userId;
    if (!id) {
      return res.status(401).json({ error: "Invalid Token" });
    }
    if (req.body?.id && req.body.id !== id) {
      return res.status(403).json({ error: "You can only request your own matches" });
    }

    const requester = await findRequester(id);
    if (!requester) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(await getMatches(requester));
  } catch (error: any) {
    console.error("Error finding matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
