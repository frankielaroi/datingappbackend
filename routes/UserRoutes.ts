import express from "express";
import mongoose from "mongoose";
import User from "../models/usermodel";
import { verifyToken } from "../controllers/verifyToken";
import { index as algoliaIndex } from "../utils/algolia";
import Swipe from "../models/swipeModel";
import { invalidateArea, invalidateUser } from "../utils/matchStore";
import { PRIVATE_FIELDS, SECRET_FIELDS, pickEditable } from "../utils/userFields";

const router = express.Router();
router.use(express.json());

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const isOwner = (req: express.Request, id: string) => String(req.user?.userId) === id;

// List users a page at a time. Pass the returned `nextCursor` as `?after=`
// to get the next page.
router.get("/api/users", verifyToken, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    if (after && !mongoose.isValidObjectId(after)) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    const filter = after ? { _id: { $gt: new mongoose.Types.ObjectId(after) } } : {};

    const page = await User.find(filter).sort({ _id: 1 }).limit(limit).select(PRIVATE_FIELDS).lean();

    res.status(200).json({
      users: page,
      nextCursor: page.length === limit ? String(page[page.length - 1]._id) : null,
    });
  } catch (error: any) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Your own profile includes your email and phone; anyone else's doesn't.
router.get("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const fields = isOwner(req, id) ? SECRET_FIELDS : PRIVATE_FIELDS;
    const user = await User.findById(id).select(fields).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (error: any) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Users may only edit their own profile, and only the whitelisted fields.
router.put("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!isOwner(req, id)) {
      return res.status(403).json({ error: "You can only edit your own profile" });
    }
    const updates = pickEditable(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    // Needed to refresh match lists around where the user was before a move.
    const before = updates.geo ? await User.findById(id).select("geo").lean() : null;
    const options = { new: true, runValidators: true, select: SECRET_FIELDS };
    const user = await User.findByIdAndUpdate(id, { $set: updates }, options);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await invalidateArea(user.toObject());
    if (before) await invalidateArea(before);
    res.status(200).json(user);
  } catch (error: any) {
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ error: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Users may only delete their own account.
router.delete("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!isOwner(req, id)) {
      return res.status(403).json({ error: "You can only delete your own account" });
    }
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    // findByIdAndDelete skips document hooks, so remove the search record here.
    algoliaIndex.deleteObject(id).catch((err) => console.error("Error removing user from Algolia:", err));
    await Swipe.deleteMany({ $or: [{ swiper: id }, { target: id }] });
    await invalidateUser(id);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
