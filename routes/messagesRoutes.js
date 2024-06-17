const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const { verifyToken } = require("../controllers/verifyToken");
const jwt = require("jsonwebtoken");
const amqp = require("amqplib");

// Define a POST route for sending messages
// To test this route with Postman:
// 1. Set the request method to POST
// 2. Set the URL to http://localhost:3000/api/message (or your server URL)
// 3. Set the request headers to include 'Authorization' with a valid JWT token
// 4. Set the request body to include 'conversationId' and 'text' fields
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
    const connection = await amqp.connect("amqps://ztjiqgzl:KxM5gy3UPX8-90ED_dz5E3d8erVcCOUh@woodpecker.rmq.cloudamqp.com/ztjiqgzl");
    const channel = await connection.createChannel();
    const exchange = "messages";
    await channel.assertExchange(exchange, "fanout", { durable: false });
    channel.publish(
      exchange,
      "",
      Buffer.from(
        JSON.stringify({
          conversationId,
          sender: req.user.userId,
          text,
        })
      )
    );

    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
