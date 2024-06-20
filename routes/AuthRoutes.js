const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");
const axios = require("axios");
const otpGenerator = require("otp-generator");
const sendEmailVerification = require("../controllers/emailVerification");
const redis = require("redis");
const Queue = require("bull");

const dotenv = require("dotenv");
dotenv.config();


const JWT_SECRET = process.env.JWT_SECRET;
// Create Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.on("error", (error) => {
  console.error("Redis error:", error);
});

redisClient.on("connect", () => {
  console.log("Connected to Redis");
});

redisClient.connect().catch((err) => {
  console.error("Could not establish a connection with Redis:", err);
});

// Setup Express and Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());

// Bull Queue Setup
const emailQueue = new Queue("emailQueue", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

const smsQueue = new Queue("smsQueue", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Function to send OTP via SMS using Arkesel SMS API
async function sendOtpViaSms(mobileNumber, otp) {
  const arkeselUrl = "https://sms.arkesel.com/sms/api?action=send-sms";
  const arkeselApiKey = process.env.ARKESEL_API_KEY;
  const arkeselSender = process.env.ARKESEL_SENDER;
  const message = `Your verification code is: ${otp}`;

  const apiUrl = `${arkeselUrl}&api_key=${arkeselApiKey}&to=${mobileNumber}&from=${arkeselSender}&sms=${message}`;

  try {
    const response = await axios.get(apiUrl);
    console.log("OTP sent successfully:", response.data);
    console.log(otp);
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

    // Check if the user already exists in Redis cache
    const cachedUser = await redisClient.get(`user:${email}`);
    if (cachedUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash the password using crypto
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    // Create a new user instance with hashed password
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

    // Save the user to the database based on the UserSchema
    await user.save();

    // Cache the user in Redis
    await redisClient.set(`user:${email}`, JSON.stringify(user));

    // Add email verification job to Bull queue
    emailQueue.add({ email, emailVerificationToken });

    // Emit event to notify clients about the new user
    io.emit("newUser", { email, username });

    // Send success response if registration is successful
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    // Handle any errors and send an error response
    res.status(500).json({ error: error.message });
  }
});

// Route to handle email verification
app.get("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    // Check if the user exists in Redis cache
    const cachedUser = await redisClient.get(`token:${token}`);
    if (!cachedUser) {
      const user = await User.findOne({ emailVerificationToken: token });
      if (!user) {
        return res.status(404).json({ error: "Invalid verification token" });
      }

      // Mark user's email as verified
      user.isEmailVerified = true;
      user.emailVerificationToken = null;
      await user.save();

      // Cache the user in Redis
      await redisClient.set(`user:${user.email}`, JSON.stringify(user));

      res.status(200).json({ message: "Email verified successfully" });
    } else {
      res.status(200).json({ message: "Email already verified" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to handle phone number verification and OTP sending
app.post("/api/verify-phone", async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    // Check if the user exists in Redis cache
    const cachedUser = await redisClient.get(`user:${mobileNumber}`);
    if (!cachedUser) {
      const user = await User.findOne({ mobileNumber });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate OTP (6-digit number)
      const otp = otpGenerator.generate(6, {
        digits: true,
        alphabets: false,
        upperCase: false,
        specialChars: false,
      });

      // Update the user document with the OTP
      user.otp = otp;
      await user.save();

      // Cache the user in Redis
      await redisClient.set(`user:${mobileNumber}`, JSON.stringify(user));

      // Add SMS job to Bull queue
      smsQueue.add({ mobileNumber, otp });

      // Send success response if OTP is sent successfully
      res.status(200).json({ message: "OTP sent to your phone number." });
    } else {
      res.status(200).json({ message: "OTP already sent" });
    }
  } catch (error) {
    // Handle any errors and send an error response
    res.status(500).json({ error: error.message });
  }
});

// Route to handle OTP verification
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    // Check if the user exists in Redis cache
    const cachedUser = await redisClient.get(`user:${mobileNumber}`);
    if (cachedUser) {
      const user = JSON.parse(cachedUser);
      if (user.otp === otp) {
        // Remove the OTP after successful verification
        user.otp = null;
        user.phoneVerified = true;
        await user.save();

        // Cache the updated user in Redis
        await redisClient.set(`user:${mobileNumber}`, JSON.stringify(user));

        // Generate a JWT token for authenticated user
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
          expiresIn: "1h",
        });

        // Send the token in response if OTP verification is successful
        res.status(200).json({ token });
      } else {
        res.status(401).json({ error: "Invalid OTP" });
      }
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    // Handle any errors and send an error response
    res.status(500).json({ error: error.message });
  }
});

// Route to handle user login
app.post("/api/auth/login", async (req, res) => {
  try {
    // Extract email and password from request body
    const { email, password } = req.body;

    // Check if the user exists in Redis cache
    const cachedUser = await redisClient.get(`user:${email}`);
    if (cachedUser) {
      const user = JSON.parse(cachedUser);

      // Compare the password with the hashed password stored in the database
      const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
      const isMatch = hashedPassword === user.password;

      // Check if passwords match
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

      // Generate a JWT token for authenticated user
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
        expiresIn: "1h",
      });

      // Send the token in response if login is successful
      res.status(200).json({ token });
    } else {
      const user = await User.findOne({ email });

      // Check if user exists
      if (!user) return res.status(404).json({ error: "User not found" });

      // Compare the password with the hashed password stored in the database
      const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
      const isMatch = hashedPassword === user.password;

      // Check if passwords match
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

      // Cache the user in Redis
      await redisClient.set(`user:${email}`, JSON.stringify(user));

      // Generate a JWT token for authenticated user
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
        expiresIn: "1h",
      });

      // Send the token in response if login is successful
      res.status(200).json({ token });
    }
  } catch (error) {
    // Handle any errors and send an error response
    res.status(500).json({ error: error.message });
  }
});

// Bull Queue Processors
emailQueue.process(async (job) => {
  const { email, emailVerificationToken } = job.data;
  await sendEmailVerification(email, emailVerificationToken);
});

smsQueue.process(async (job) => {
  const { mobileNumber, otp } = job.data;
  await sendOtpViaSms(mobileNumber, otp);
});

module.exports = app;
