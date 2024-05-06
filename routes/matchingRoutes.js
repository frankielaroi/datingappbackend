const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");

router.post("/api/match/", async (req, res) => {
  try {
    const { id } = req.body; // Extract id from request body

    // Validate the request body
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Fetch user preferences based on user ID
    const userPreferences = await User.findById(id).lean();

    // Check if user preferences exist
    if (!userPreferences) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure that user preferences are retrieved and fallback to an empty object if not found
    const userPrefs = userPreferences?.matchPreferences || {};

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
      res.status(200).json(availablePeople);
    } else {
      res.status(200).json(matches.slice(0, 10));
    }
  } catch (error) {
    console.error("Error finding matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
