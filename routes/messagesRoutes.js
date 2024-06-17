const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");
const jwt = require("jsonwebtoken");
const amqp = require("amqplib");
const dotenv = require("dotenv");
dotenv.config();

// RabbitMQ connection and channel pooling
let amqpConnection = null;
let amqpChannel = null;

const initializeRabbitMQ = async () => {
  try {
    amqpConnection = await amqp.connect(process.env.RABBITMQ_URL);
    amqpChannel = await amqpConnection.createChannel();
    await amqpChannel.assertExchange("messages", "fanout", { durable: false });
    console.log("RabbitMQ connection and channel initialized");
  } catch (error) {
    console.error("Error initializing RabbitMQ:", error);
    setTimeout(initializeRabbitMQ, 5000); // Retry after 5 seconds
  }
};

// Initialize RabbitMQ connection and channel on startup
initializeRabbitMQ();

// Define a POST route for sending messages
router.post("/api/message", verifyToken, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const message = new Message({
      conversationId,
      sender: req.user.userId,
      text,
    });

    await message.save();

    // Publish message to RabbitMQ
    if (amqpChannel) {
      amqpChannel.publish(
        "messages",
        "",
        Buffer.from(
          JSON.stringify({
            conversationId,
            sender: req.user.userId,
            text,
          })
        )
      );
      console.log("Message published to RabbitMQ");
    } else {
      console.error("RabbitMQ channel is not initialized");
    }

    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
