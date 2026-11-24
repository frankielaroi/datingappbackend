import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/usermodel";
import axios from "axios";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const otpGenerator = require("otp-generator");
import sendEmailVerification from "../controllers/emailVerification";
import { hashPassword, isAcceptablePassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../utils/password";
import { loginLimiter, otpLimiter, registerLimiter } from "../utils/rateLimit";

const OTP_TTL_MS = 10 * 60 * 1000;

import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Setup Express and Socket.io
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Function to send OTP via SMS using Arkesel SMS API
async function sendOtpViaSms(mobileNumber: string, otp: string) {
  const arkeselUrl = "https://sms.arkesel.com/sms/api";
  const arkeselApiKey = process.env.ARKESEL_API_KEY;
  const arkeselSender = process.env.ARKESEL_SENDER;
  const message = `Your verification code is: ${otp}`;

  const params = new URLSearchParams({
    action: "send-sms",
    api_key: arkeselApiKey,
    to: mobileNumber,
    from: arkeselSender,
    sms: message,
  });

  try {
    const response = await axios.get(`${arkeselUrl}?${params.toString()}`);
    console.log("OTP sent successfully:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Error sending OTP via SMS:", error.message);
    throw new Error("Failed to send OTP via SMS");
  }
}

// Route to handle user registration
app.post("/api/register", registerLimiter, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      age,
      gender,
      mobileNumber,
      relationshipType,
      sexualOrientation,
      location,
      lastName,
      firstName,
    } = req.body;

    if (!isAcceptablePassword(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const hashedPassword = await hashPassword(password);
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    const user = new User({
      username,
      email,
      password: hashedPassword,
      age,
      gender,
      mobileNumber,
      relationshipType,
      sexualOrientation,
      location,
      lastName,
      firstName,
      emailVerificationToken,
    });

    await Promise.all([
      user.save(),
      sendEmailVerification(email, emailVerificationToken)
    ]);

    res.status(201).json({ message: "User registered successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle email verification
app.get("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    const user = await User.findOneAndUpdate(
      { emailVerificationToken: token },
      { $set: { isEmailVerified: true }, $unset: { emailVerificationToken: 1 } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Invalid verification token" });
    }

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle phone number verification and OTP sending
app.post("/api/verify-phone", otpLimiter, async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (typeof mobileNumber !== "string" || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: "A valid 10-digit mobile number is required" });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });

    const update = { $set: { otp, otpExpires: new Date(Date.now() + OTP_TTL_MS) } };
    const user = await User.findOneAndUpdate({ mobileNumber }, update);

    // Only text numbers that belong to an account (no paying for SMS to
    // random numbers), but answer the same way so numbers can't be probed.
    if (user) {
      await sendOtpViaSms(mobileNumber, otp);
    }

    res.status(200).json({ message: "If this number is registered, a code has been sent." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle OTP verification
app.post("/api/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;
    if (typeof mobileNumber !== "string" || typeof otp !== "string") {
      return res.status(400).json({ error: "mobileNumber and otp are required" });
    }
    const match = { mobileNumber, otp, otpExpires: { $gt: new Date() } };
    const clear = { $set: { phoneVerified: true }, $unset: { otp: 1, otpExpires: 1 } };

    const user = await User.findOneAndUpdate(match, clear, { new: true });

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired code" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.status(200).json({ token });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle user login
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
    // Same answer for unknown email and wrong password, so accounts can't be probed.
    const { valid, needsRehash } = await verifyPassword(password, user?.password);
    if (!user || !valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (needsRehash) {
      // updateOne skips the save hook, so the Algolia record isn't touched.
      await User.updateOne({ _id: user._id }, { $set: { password: await hashPassword(password) } });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "6h" });
    res.status(200).json({ token });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;