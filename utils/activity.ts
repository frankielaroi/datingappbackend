import User from "../models/usermodel";
import { redisClient } from "./redis";

// Write lastActiveAt at most once per window per user, so busy users don't
// cause a database write on every request.
const ACTIVITY_WRITE_INTERVAL_SECONDS = 15 * 60;

export async function touchActivity(userId: unknown): Promise<void> {
  if (!userId) return;
  try {
    const first = await redisClient.set(`active:${userId}`, "1", {
      NX: true,
      EX: ACTIVITY_WRITE_INTERVAL_SECONDS,
    });
    if (first) await User.updateOne({ _id: userId }, { $set: { lastActiveAt: new Date() } });
  } catch (error) {
    console.error("Failed to record activity:", error);
  }
}
