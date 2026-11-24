import Bull from "bull";
import { redisConnection } from "./redis";

// Background match-list work. The API only adds jobs; worker.ts runs them.
// Created on first use so scripts that never queue anything (seed, migrations)
// don't open Redis connections that keep the process alive.
let queue: Bull.Queue | null = null;
export function getMatchQueue(): Bull.Queue {
  queue ??= new Bull("match-refresh", { redis: redisConnection });
  return queue;
}

export async function closeMatchQueue() {
  if (queue) await queue.close();
  queue = null;
}

export const REFRESH_JOB = "refresh";
const jobOptions = (userId: string) => ({ jobId: `refresh:${userId}`, removeOnComplete: true, removeOnFail: 100 });

// Rebuild one user's list soon. The jobId de-duplicates repeat requests while
// one is already waiting.
export async function scheduleRefresh(userId: string) {
  try {
    await getMatchQueue().add(REFRESH_JOB, { userId }, jobOptions(userId));
  } catch (error) {
    console.error("Could not schedule match refresh:", error);
  }
}

export async function scheduleRefreshMany(userIds: string[]) {
  if (!userIds.length) return;
  await getMatchQueue().addBulk(userIds.map((userId) => ({ name: REFRESH_JOB, data: { userId }, opts: jobOptions(userId) })));
}
