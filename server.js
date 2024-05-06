// Import required packages and modules
const express = require("express");
const User = require("./models/usermodel");
const { validationResult } = require("express-validator");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

// Load environment variables from .env file
dotenv.config();

// Create an Express app instance
const app = express();

// Set the port number from environment variable or default to 3000
const PORT = process.env.PORT || 3000;

// Set the MongoDB URI from environment variable or default to local MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB database
mongoose.connect(MONGODB_URI);

// Handle MongoDB connection errors
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

// Use body-parser middleware to parse JSON requests
app.use(bodyParser.json());
app.use(cors());
// Import and use route handler modules
const authRoutes = require("./routes/AuthRoutes");
const userRoutes = require("./routes/UserRoutes");
const resetRoutes = require("./routes/resetRoutes")
const matchingRoutes =require("./routes/matchingRoutes")
// Mount route handler modules at base paths
app.use(authRoutes);
app.use(userRoutes);
app.use(resetRoutes);
app.use(matchingRoutes);


// Start the server and listen on specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
