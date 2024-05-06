const express = require("express");
const router = express.Router();
const User = require("../models/usermodel");

router.post("/api/match/:id", async (req, res) => {
    try {
        console.log("Entering /api/match route");
        const {id}  = req.params.id; // Extract id from request body
    console.log(`User ID: ${id}`);
    const userPreferences = await User.findById(id).lean();
    console.log("User preferences fetched:", userPreferences);

    if (!userPreferences || !userPreferences.preferences) {
      console.log("User not found");
      return res.status(404).json({ error: "User not found" });
    }

    const matches = await User.find({
      $and: [
        {
          "preferences.age": {
            $gte: userPreferences.preferences.minAge || 0,
            $lte: userPreferences.preferences.maxAge || 100,
          },
        },
        { "preferences.gender": userPreferences.preferences.gender },
        { "preferences.location": userPreferences.preferences.location },
        {
          "preferences.sexualOrientation":
            userPreferences.preferences.sexualOrientation,
        },
        {
          "preferences.relationshipType":
            userPreferences.preferences.relationshipType,
        },
        {
          "preferences.height": {
            $gte: userPreferences.preferences.minHeight || 0,
            $lte: userPreferences.preferences.maxHeight || 250,
          },
        },
        {
          "preferences.bodyType": {
            $in: userPreferences.preferences.bodyTypes || [],
          },
        },
        { "preferences.smoking": userPreferences.preferences.smoking },
        { "preferences.drinking": userPreferences.preferences.drinking },
        {
          "preferences.exerciseFrequency":
            userPreferences.preferences.exerciseFrequency,
        },
        {
          "preferences.religiousAffiliation":
            userPreferences.preferences.religiousAffiliation,
        },
        {
          "preferences.politicalViews":
            userPreferences.preferences.politicalViews,
        },
        {
          "preferences.culturalBackground":
            userPreferences.preferences.culturalBackground,
        },
        {
          "preferences.introversionExtraversion":
            userPreferences.preferences.introversionExtraversion,
        },
        { "preferences.openness": userPreferences.preferences.openness },
        {
          "preferences.conscientiousness":
            userPreferences.preferences.conscientiousness,
        },
        {
          "preferences.emotionalStability":
            userPreferences.preferences.emotionalStability,
        },
        {
          "preferences.agreeableness":
            userPreferences.preferences.agreeableness,
        },
      ],
    });
    console.log("Matches found:", matches);

    if (matches.length === 0) {
      console.log("No matches found, fetching available people");
      const availablePeople = await User.find({}, { _id: 0, preferences: 1 });
      res.status(200).json(availablePeople);
    } else {
      console.log("Sending top 10 matches");
      res.status(200).json(matches.slice(0, 10));
    }
  } catch (error) {
    console.error("Error finding matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
