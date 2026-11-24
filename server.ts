import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";
import session from "express-session";
import RedisSessionStore from "connect-redis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import websocket from "./routes/websocket";
import passport from "./controllers/passport";
import AuthRoutesRouter from "./routes/AuthRoutes";
import UserRoutesRouter from "./routes/UserRoutes";
import resetRoutesRouter from "./routes/resetRoutes";
import matchingRoutesRouter from "./routes/matchingRoutes";
import swipeRoutesRouter from "./routes/swipeRoutes";
import searchRoutesRouter from "./routes/searchRoutes";
import postRoutesRouter from "./routes/postRoutes";
import postInteractionRouter from "./routes/postInteraction";
import messagesRoutesRouter from "./routes/messagesRoutes";
import conversationRoutesRouter from "./routes/conversationRoutes";
import googleRoutesRouter from "./routes/googleRoutes";
import { closeRedis, redisClient, redisReady } from "./utils/redis";
import { closeMatchQueue } from "./utils/matchQueue";

/**
 * API server. Stateless apart from Redis and MongoDB, so any number of
 * instances can run behind a load balancer: sessions, rate-limit counters,
 * Socket.IO rooms and match lists are all shared through Redis.
 */

const PORT = Number(process.env.PORT) || 4001;

const app = express();
// Behind a load balancer, trust its X-Forwarded-For so rate limits see the
// real client IP. Set TRUST_PROXY to the number of proxies in front of the app.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

app.use(express.json());
app.use(cors());
app.use(
  session({
    store: new RedisSessionStore({ client: redisClient, prefix: "sess:" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// For load balancer health checks.
app.get("/healthz", async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const redisOk = redisClient.isReady && (await redisClient.ping().catch(() => null)) === "PONG";
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongo: mongoOk, redis: redisOk });
});

[
  AuthRoutesRouter,
  UserRoutesRouter,
  resetRoutesRouter,
  matchingRoutesRouter,
  swipeRoutesRouter,
  searchRoutesRouter,
  postRoutesRouter,
  postInteractionRouter,
  messagesRoutesRouter,
  conversationRoutesRouter,
  googleRoutesRouter,
].forEach((router) => app.use(router));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

async function start() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  await redisReady;
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  websocket(io);

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  // Stop taking new connections, let in-flight requests finish, then close
  // the shared connections.
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await closeMatchQueue().catch(() => undefined);
  await Promise.all([pubClient.quit().catch(() => undefined), subClient.quit().catch(() => undefined)]);
  await closeRedis();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
