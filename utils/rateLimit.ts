import rateLimit, { Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Request } from "express";
import { redisClient } from "./redis";

// Counters live in Redis, so limits hold across every server instance.
const store = (name: string) =>
  new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  });

const base: Partial<Options> = { standardHeaders: "draft-7", legacyHeaders: false };

const field = (req: Request, name: string) =>
  String(req.body?.[name] ?? "").trim().toLowerCase();

// Login: per IP and per account, so one attacker can't spray many accounts
// and many IPs can't hammer one account.
export const loginLimiter = rateLimit({
  ...base,
  store: store("login"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `login:${req.ip}:${field(req, "email")}`,
  message: { error: "Too many login attempts, try again later" },
});

export const registerLimiter = rateLimit({
  ...base,
  store: store("register"),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `register:${req.ip}`,
  message: { error: "Too many sign-ups from this address, try again later" },
});

// OTP send and verify: per phone number, which also caps SMS spend.
export const otpLimiter = rateLimit({
  ...base,
  store: store("otp"),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `otp:${field(req, "mobileNumber")}`,
  message: { error: "Too many code requests for this number, try again later" },
});

export const passwordResetLimiter = rateLimit({
  ...base,
  store: store("passwordReset"),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `reset:${req.ip}`,
  message: { message: "Too many password reset requests, try again later" },
});

// Per signed-in user (verifyToken runs first and sets req.user).
export const matchLimiter = rateLimit({
  ...base,
  store: store("match"),
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `match:${req.user?.userId ?? req.ip}`,
  message: { error: "Too many match requests, slow down" },
});

export const swipeLimiter = rateLimit({
  ...base,
  store: store("swipe"),
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => `swipe:${req.user?.userId ?? req.ip}`,
  message: { error: "Too many swipes, slow down" },
});

export const searchLimiter = rateLimit({
  ...base,
  store: store("search"),
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `search:${req.user?.userId ?? req.ip}`,
  message: { error: "Too many searches, slow down" },
});
