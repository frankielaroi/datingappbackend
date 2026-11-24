import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/usermodel";
import { findRequester } from "./utils/matching";
import { buildList } from "./utils/matchStore";
import { closeMatchQueue, getMatchQueue, REFRESH_JOB, scheduleRefreshMany } from "./utils/matchQueue";
import { closeRedis, redisReady } from "./utils/redis";

dotenv.config();

/**
 * Background worker: rebuilds match lists so API requests rarely have to.
 * Run one or more alongside the API (npm run worker). Bull spreads jobs
 * across however many workers are running.
 */

const REFRESH_CONCURRENCY = Number(process.env.MATCH_WORKER_CONCURRENCY ?? 4);
const SWEEP_JOB = "sweep";
// Nightly rebuild for everyone active in the last week.
const SWEEP_CRON = process.env.MATCH_SWEEP_CRON ?? "0 3 * * *";
const SWEEP_ACTIVE_DAYS = 7;
const SWEEP_BATCH = 1000;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  await redisReady;
  const matchQueue = getMatchQueue();

  matchQueue.process(REFRESH_JOB, REFRESH_CONCURRENCY, async (job) => {
    const requester = await findRequester(job.data.userId);
    if (requester) await buildList(requester);
  });

  matchQueue.process(SWEEP_JOB, 1, async () => {
    const since = new Date(Date.now() - SWEEP_ACTIVE_DAYS * 24 * 60 * 60 * 1000);
    let batch: string[] = [];
    let total = 0;
    for await (const u of User.find({ lastActiveAt: { $gte: since } }).select("_id").lean().cursor()) {
      batch.push(String(u._id));
      if (batch.length === SWEEP_BATCH) {
        await scheduleRefreshMany(batch);
        total += batch.length;
        batch = [];
      }
    }
    await scheduleRefreshMany(batch);
    return { scheduled: total + batch.length };
  });

  await matchQueue.add(SWEEP_JOB, {}, { repeat: { cron: SWEEP_CRON }, jobId: "nightly-sweep", removeOnComplete: true });
  console.log(`Match worker running (concurrency ${REFRESH_CONCURRENCY}, sweep "${SWEEP_CRON}")`);
}

async function shutdown() {
  await closeMatchQueue();
  await closeRedis();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
