require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const amqp = require("amqplib");
const { createClient } = require("redis");
const Queue = require("bull");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");

// Setup Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity; adjust as needed
    methods: ["GET", "POST"],
  },
});

app.use(express.json());

// Redis Client Setup
const redisClient = createClient({
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
  const message = new Message({
    conversationId,
    sender,
    text,
  });

  await message.save();

  // Publish message to RabbitMQ
  if (amqpChannel) {
    amqpChannel.publish(
      "messages",
      "",
      Buffer.from(JSON.stringify({ conversationId, sender, text }))
    );
  }

  // Emit message to Socket.io clients
  io.to(conversationId).emit("newMessage", { conversationId, sender, text });

  // Cache the message
  await redisClient.lPush(`${conversationId}:messages`, JSON.stringify(message));
  await redisClient.lTrim(`${conversationId}:messages`, 0, 99); // Keep only the latest 100 messages in cache
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

  socket.on("sendMessage", async (data) => {
    const { conversationId, text } = data;
    const token = socket.handshake.query.token;
    try {
      const { userId } = jwt.verify(token, process.env.JWT_SECRET);
      await messageQueue.add({ conversationId, sender: userId, text });
    } catch (error) {
      console.error("Error verifying token:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Cache middleware
const cacheMiddleware = async (req, res, next) => {
  const { conversationId } = req.body;
  try {
    const data = await redisClient.get(`${conversationId}:message`);

    if (data) {
      res.status(200).json(JSON.parse(data));
    } else {
      next();
    }
  } catch (err) {
    console.error("Redis error:", err);
    next();
  }
};

// Define a POST route for sending messages
app.post("/api/message", verifyToken, cacheMiddleware, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const message = new Message({
      conversationId,
      sender: req.user.userId,
      text,
    });

    await message.save();

    // Add job to the queue
    await messageQueue.add({ conversationId, sender: req.user.userId, text });

    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Define a GET route for retrieving messages from a conversation
app.get("/api/message", verifyToken, async (req, res) => {
  const conversationId = req.query.conversationId;
  try {
    // Check the type of the key first
    const keyType = await redisClient.type(`${conversationId}:messages`);
    if (keyType !== 'list') {
      await redisClient.del(`${conversationId}:messages`);
    }

    // Check cache first
    const cachedMessages = await redisClient.lRange(`${conversationId}:messages`, 0, -1);
    if (cachedMessages.length > 0) {
      return res.status(200).json(cachedMessages.map((message) => JSON.parse(message)));
    }

    // If no cache, query the database
    const messages = await Message.find({ conversationId });
    if (!messages) {
      return res.status(404).json({ error: "Messages not found" });
    }

    // Cache the messages
    for (const message of messages) {
      await redisClient.rPush(`${conversationId}:messages`, JSON.stringify(message));
    }

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error retrieving messages:", error);
    res.status(500).json({ error: "Failed to retrieve messages" });
  }
});


module.exports = app;
