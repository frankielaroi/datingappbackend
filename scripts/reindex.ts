import dotenv from "dotenv";
import mongoose from "mongoose";
import populateAlgolia from "../utils/populate";

dotenv.config();

// Full Algolia re-index. Run by hand (npm run reindex) after bulk imports;
// day-to-day changes are synced by the model save hooks.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  await populateAlgolia();
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Reindex failed:", error);
  process.exit(1);
});
