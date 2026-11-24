import * as redis from "redis";
import dotenv from "dotenv";
dotenv.config();

// Connection settings shared by every Redis user: this client, Bull queues,
// the Socket.IO adapter, the session store and the rate limiter.
export const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
};

// One client per process. Use duplicate() for pub/sub connections.
export const redisClient = redis.createClient({
  socket: { host: redisConnection.host, port: redisConnection.port },
  password: redisConnection.password,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

export const redisReady = redisClient.connect().catch((err) => {
  console.error("Could not connect to Redis:", err);
});

export async function closeRedis() {
  if (redisClient.isOpen) await redisClient.quit();
}
