const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const amqp = require("amqplib");
const redis = require("redis");
const Queue = require("bull");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");

// Setup Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());

// Redis Client Setup
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  password: process.env.REDIS_PASSWORD,
});

redisClient.on("error", (error) => console.error("Redis error:", error));
redisClient.on("connect", () => console.log("Connected to Redis"));

redisClient.connect().catch((err) => {
  console.error("Could not establish a connection with Redis:", err);
});

// Bull Queue Setup
const messageQueue = new Queue("messageQueue", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

// RabbitMQ Channel Initialization
let amqpChannel;
amqp
  .connect(process.env.RABBITMQ_URL)
  .then((connection) => connection.createChannel())
  .then((channel) => {
    amqpChannel = channel;
    return amqpChannel.assertExchange("messages", "fanout", { durable: false });
  })
  .catch((error) => console.error("Error initializing RabbitMQ:", error));

// Function to handle message processing
async function handleMessageProcessing(conversationId, sender, text) {
  const message = new Message({ conversationId, sender, text });
  await message.save();

  if (amqpChannel) {
    amqpChannel.publish("messages", "", Buffer.from(JSON.stringify({ conversationId, sender, text })));
  }

  io.to(conversationId).emit("newMessage", { conversationId, sender, text });
}

// Process jobs in the Bull queue
messageQueue.process(async (job) => {
  const { conversationId, sender, text } = job.data;
  await handleMessageProcessing(conversationId, sender, text);
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`Client joined conversation: ${conversationId}`);
  });

  socket.on("sendMessage", async ({ conversationId, text, token }) => {
    try {
      const { userId } = jwt.verify(token, process.env.JWT_SECRET);
      messageQueue.add({ conversationId, sender: userId, text });
    } catch (error) {
      console.error("Error verifying token:", error);
    }
  });

  socket.on("disconnect", () => console.log("Client disconnected"));
});

// Cache middleware
const cacheMiddleware = async (req, res, next) => {
  const { conversationId } = req.body;
  try {
    const data = await redisClient.get(`${conversationId}:message`);
    if (data) {
      return res.status(200).json(JSON.parse(data));
    }
    next();
  } catch (err) {
    console.error("Redis error:", err);
    next();
  }
};

// Define a GET route for retrieving messages from a conversation
app.get("/api/messages", verifyToken, async (req, res) => {
  const { conversationId } = req.query;
  try {
    const cachedMessages = await redisClient.get(`${conversationId}:messages`);
    if (cachedMessages) {
      return res.status(200).json(JSON.parse(cachedMessages));
    }

    const messages = await Message.find({ conversationId }).sort("createdAt").lean();

    await redisClient.set(`${conversationId}:messages`, JSON.stringify(messages), {
      EX: 300, // Cache for 5 minutes
    });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error retrieving messages:", error);
    res.status(500).json({ error: "Failed to retrieve messages" });
  }
});

// Start the server
module.exports = app;

process.on('SIGINT', async () => {
  await redisClient.quit();
  console.log('Redis client disconnected');
  process.exit(0);
});
