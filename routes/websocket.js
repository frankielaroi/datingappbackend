const jwt = require("jsonwebtoken");
const formatMessage = require("../utils/message");
const {
  userJoin,
  userLeave,
  getCurrentUser,
  getRoomUsers,
} = require("../utils/user");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const Redis = require("ioredis"); // Use ioredis instead of redis
const io = require("socket.io")(); // Define io here
const dotenv = require('dotenv')
dotenv.config();
const botName = "Frankie Socket";

// Setup Redis client
const redisClient = new Redis({
  host: process.env.REDIS_HOST, // Use the provided REDIS_HOST or fallback to localhost
  port: process.env.REDIS_PORT, // Use the provided REDIS_PORT or fallback to default Redis port
  password: process.env.REDIS_PASSWORD, // Use the provided REDIS_PASSWORD or null if not provided
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = function (io) {
  // Middleware to verify JWT token for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.query.token;
    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          console.log("Authentication error:", err);
          return next(new Error("Authentication error"));
        }
        socket.decoded = decoded;
        next();
      });
    } else {
      console.log("Authentication error: No token provided");
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket.decoded; // Get the userId from the decoded token
    console.log(`New connection from ${userId}`);

    socket.on("joinRoom", async ({ conversationId }) => {
      const room = conversationId; // Use conversationId as room name
      const user = userJoin(socket.id, userId, room);
      console.log(`${userId} joined room ${room}`);

      socket.join(user.room);

      // Fetch previous messages from the database
      try {
        const conversation = await Conversation.findById(room)
          .populate("messages")
          .exec();
        if (conversation) {
          conversation.messages.forEach((message) => {
            io.to(user.room).emit(
              "message",
              formatMessage(message.sender, message.text)
            );
          });
        }
      } catch (err) {
        console.error("Error fetching conversation:", err);
      }

      // Check for offline messages in Redis
      try {
        const offlineMessages = await redisClient.lrange(
          `offlineMessages:${userId}`,
          0,
          -1
        );
        offlineMessages.forEach((msg) => {
          const parsedMsg = JSON.parse(msg);
          io.to(user.room).emit(
            "message",
            formatMessage(parsedMsg.sender, parsedMsg.text)
          );
        });
        await redisClient.del(`offlineMessages:${userId}`); // Clear stored messages after sending
      } catch (err) {
        console.error("Error fetching offline messages:", err);
      }

      io.to(user.room).emit(
        "message",
        formatMessage(botName, `${userId} has joined the chat`)
      );

      socket.on("chatMessage", async (msg) => {
        const newMessage = new Message({
          conversationId: room,
          sender: userId,
          text: msg,
        });
        await newMessage.save(); // Save the new message to the database

        // Get the recipients of the conversation
        const recipientIds = await getRecipientIds(room, userId);

        recipientIds.forEach(async (recipientId) => {
          const recipientSocket = findUserSocket(recipientId);

          if (recipientSocket) {
            io.to(recipientSocket.id).emit(
              "message",
              formatMessage(userId, msg)
            );
          } else {
            try {
              await redisClient.rpush(
                `offlineMessages:${recipientId}`,
                JSON.stringify({ sender: userId, text: msg })
              );
            } catch (err) {
              console.error("Error storing offline message:", err);
            }
          }
        });

        io.to(user.room).emit("message", formatMessage(userId, msg));
      });

      socket.on("disconnect", () => {
        const user = userLeave(socket.id);

        if (user) {
          console.log(`${userId} disconnected from room ${user.room}`);
          io.to(user.room).emit(
            "message",
            formatMessage(botName, `${userId} has left the chat`)
          );
        }
      });
    });
  });
};

// Implement this function to get the recipient userIds from the conversation
async function getRecipientIds(conversationId, senderId) {
  try {
    const conversation = await Conversation.findById(conversationId).exec();
    if (conversation) {
      // Assuming the conversation participants are stored in an array called 'participants'
      return conversation.participants.filter(
        (id) => id.toString() !== senderId.toString()
      );
    }
    return [];
  } catch (err) {
    console.error("Error fetching recipients:", err);
    return [];
  }
}

// Implement this function to find the recipient's socket
function findUserSocket(userId) {
  const user = getCurrentUser(userId);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}

process.on("SIGINT", () => {
  redisClient.quit().then(() => {
    console.log("Redis client disconnected");
    process.exit(0);
  });
});

// Make it realtime
io.on("connection", (socket) => {
  socket.on("joinRoom", ({ conversationId }) => {
    socket.join(conversationId);
  });

  socket.on("chatMessage", async (data) => {
    const { conversationId, message } = data;
    const newMessage = new Message({
      conversationId,
      sender: socket.decoded.userId,
      text: message,
    });
    await newMessage.save();

    const conversation = await Conversation.findById(conversationId).populate(
      "participants"
    );
    const recipientIds = conversation.participants.map((participant) =>
      participant._id.toString()
    );

    recipientIds.forEach((recipientId) => {
      if (recipientId !== socket.decoded.userId) {
        const recipientSocket = findUserSocket(recipientId);
        if (recipientSocket) {
          io.to(recipientSocket.id).emit("newMessage", {
            conversationId,
            message: formatMessage(socket.decoded.userId, message),
          });
        } else {
          redisClient.rpush(
            `offlineMessages:${recipientId}`,
            JSON.stringify({
              conversationId,
              sender: socket.decoded.userId,
              text: message,
            })
          );
        }
      }
    });

    io.to(conversationId).emit("newMessage", {
      conversationId,
      message: formatMessage(socket.decoded.userId, message),
    });
  });

  socket.on("disconnect", () => {
    const user = getCurrentUser(socket.decoded.userId);
    if (user) {
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        socket.leave(room);
        io.to(room).emit("userLeft", {
          userId: socket.decoded.userId,
          room,
        });
      });
    }
  });
});
