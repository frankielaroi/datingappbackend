const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const messageSockets = require('./routes/websocket')

// Load environment variables from .env file
dotenv.config();

// Create an Express app instance
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Set the port number from environment variable or default to 4001
const PORT = process.env.PORT || 4001;

// Handle MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI);

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
const resetRoutes = require("./routes/resetRoutes");
const matchingRoutes = require("./routes/matchingRoutes");
const searchRoutes = require("./routes/searchRoutes");
const postRoutes = require("./routes/postRoutes");
const postInteraction = require("./routes/postInteraction");
const MessageRoutes = require("./routes/messagesRoutes");
const ConversationRoute = require("./routes/conversationRoutes");

// Mount route handler modules at base paths
app.use(authRoutes);
app.use(userRoutes);
app.use(resetRoutes);
app.use(matchingRoutes);
app.use(searchRoutes);
app.use(postRoutes);
app.use(postInteraction);
app.use(MessageRoutes);
app.use(ConversationRoute);


const server = http.createServer(app);
messageSockets(server);

// Start the server and listen on specified port
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
