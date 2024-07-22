const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");
const GoogleUser = require("../models/googleUser");
const axios = require("axios");
const otpGenerator = require("otp-generator");
const sendEmailVerification = require("../controllers/emailVerification");

const dotenv = require("dotenv");
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Setup Express and Socket.io
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Function to send OTP via SMS using Arkesel SMS API
async function sendOtpViaSms(mobileNumber, otp) {
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
  } catch (error) {
    console.error("Error sending OTP via SMS:", error.message);
    throw new Error("Failed to send OTP via SMS");
  }
}

// Route to handle user registration
app.post("/api/register", async (req, res) => {
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

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle phone number verification and OTP sending
app.post("/api/verify-phone", async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    const otp = otpGenerator.generate(6, {
      digits: true,
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });

    const [user,GoogleUser] = await Promise.all([
      User.findOneAndUpdate(
        { mobileNumber },
        { $set: { otp } },
        { new: true }
      ),
      GoogleUser.findOneAndUpdate(
        { mobileNumber },
        { $set: { otp } },
        { new: true }
      ),
      sendOtpViaSms(mobileNumber, otp)
    ]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ message: "OTP sent to your phone number." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle OTP verification
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    const user = await Promise.all([
  User.findOneAndUpdate(
      { mobileNumber, otp },
      { $set: { phoneVerified: true }, $unset: { otp: 1 } },
      { new: true }
      ),
      GoogleUser.findOneAndUpdate(
      { mobileNumber, otp },
      { $set: { phoneVerified: true }, $unset: { otp: 1 } },
      { new: true }
      )
    ])
      

    if (!user) {
      return res.status(401).json({ error: "Invalid OTP or user not found" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle user login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    if (hashedPassword !== user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "6h" });
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;