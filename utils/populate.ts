import User from "../models/usermodel";
import { index, toAlgoliaRecord } from "./algolia";

const BATCH_SIZE = 1000;

// Streams users in batches so memory stays flat no matter how many there are.
const populateAlgolia = async () => {
  try {
    let batch: Record<string, unknown>[] = [];
    let total = 0;
    for await (const user of User.find().lean().cursor()) {
      batch.push(toAlgoliaRecord(user));
      if (batch.length === BATCH_SIZE) {
        await index.saveObjects(batch);
        total += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await index.saveObjects(batch);
      total += batch.length;
    }
    console.log(`Indexed ${total} users in Algolia`);
  } catch (error: any) {
    console.error("Error populating Algolia:", error);
  }
};

export default populateAlgolia;
