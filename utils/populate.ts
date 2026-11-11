import User from "../models/usermodel";
import { index, toAlgoliaRecord } from "./algolia";


const populateAlgolia = async () => {
  try {
    const users = await User.find().lean(); // Fetch all users from MongoDB

    // Add objects to Algolia
    const objects = users.map(toAlgoliaRecord);

    await index.saveObjects(objects);
    console.log("Users indexed in Algolia successfully");
  } catch (error: any) {
    console.error("Error populating Algolia:", error);
  }
};

(async () => {
  await populateAlgolia();
})();

export default populateAlgolia;
