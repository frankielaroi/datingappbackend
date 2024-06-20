const mongoose = require("mongoose");
const algoliasearch = require("algoliasearch");
const User = require("../models/usermodel");
const dotenv = require("dotenv");
dotenv.config();

const client = algoliasearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_ADMIN_API_KEY
);
const index = client.initIndex(process.env.ALGOLIA_INDEX_NAME);

const populateAlgolia = async () => {
  try {
    const users = await User.find().lean(); // Fetch all users from MongoDB

    // Add objects to Algolia
    const objects = users.map((user) => ({
      objectID: user._id.toString(),
      username: user.username,
      email: user.email,
      age: user.age,
      gender: user.gender,
      location: user.location,
      relationshipType: user.relationshipType,
      sexualOrientation: user.sexualOrientation,
      height: user.height,
      bodyType: user.bodyType,
      smoking: user.smoking,
      drinking: user.drinking,
      exerciseFrequency: user.exerciseFrequency,
      religiousAffiliation: user.religiousAffiliation,
      politicalViews: user.politicalViews,
      culturalBackground: user.culturalBackground,
      introversionExtraversion: user.introversionExtraversion,
      openness: user.openness,
      conscientiousness: user.conscientiousness,
      emotionalStability: user.emotionalStability,
      agreeableness: user.agreeableness,
    }));

    await index.saveObjects(objects);
    console.log("Users indexed in Algolia successfully");
  } catch (error) {
    console.error("Error populating Algolia:", error);
  }
};

(async () => {
  await populateAlgolia();
})();

module.exports = populateAlgolia;
