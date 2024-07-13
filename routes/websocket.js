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
const Redis = require("ioredis");
const io = require("socket.io")();
const dotenv = require('dotenv');
dotenv.config();
const botName = "Frankie Socket";

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = function (io) {
  io.use((socket, next) => {
    const token = socket.handshake.query.token;
    if (token) {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Authentication error"));
        socket.decoded = decoded;
        next();
      });
    } else {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket.decoded;

    socket.on("joinRoom", async ({ conversationId }) => {
      const room = conversationId;
      const user = userJoin(socket.id, userId, room);

      socket.join(user.room);

      try {
        const [conversation, offlineMessages] = await Promise.all([
          Conversation.findById(room).populate("messages").lean().exec(),
          redisClient.lrange(`offlineMessages:${userId}`, 0, -1)
        ]);

        if (conversation) {
          io.to(user.room).emit("bulkMessages", conversation.messages.map(message => 
            formatMessage(message.sender, message.text)
          ));
        }

        if (offlineMessages.length > 0) {
          const parsedMessages = offlineMessages.map(msg => {
            const parsedMsg = JSON.parse(msg);
            return formatMessage(parsedMsg.sender, parsedMsg.text);
          });
          io.to(user.room).emit("bulkMessages", parsedMessages);
          await redisClient.del(`offlineMessages:${userId}`);
        }

        io.to(user.room).emit("message", formatMessage(botName, `${userId} has joined the chat`));
      } catch (err) {
        console.error("Error fetching data:", err);
      }

      socket.on("chatMessage", async (msg) => {
        const newMessage = new Message({
          conversationId: room,
          sender: userId,
          text: msg,
        });

        try {
          const [savedMessage, conversation] = await Promise.all([
            newMessage.save(),
            Conversation.findByIdAndUpdate(
              room,
              { $push: { messages: newMessage._id } },
              { new: true }
            ).lean().exec()
          ]);

          const recipientIds = conversation.participants.filter(id => id.toString() !== userId.toString());

          const sendPromises = recipientIds.map(async (recipientId) => {
            const recipientSocket = findUserSocket(recipientId);
            if (recipientSocket) {
              io.to(recipientSocket.id).emit("message", formatMessage(userId, msg));
            } else {
              await redisClient.rpush(
                `offlineMessages:${recipientId}`,
                JSON.stringify({ sender: userId, text: msg })
              );
            }
          });

          await Promise.all(sendPromises);

          io.to(user.room).emit("message", formatMessage(userId, msg));
        } catch (err) {
          console.error("Error processing message:", err);
        }
      });

      socket.on("disconnect", () => {
        const user = userLeave(socket.id);
        if (user) {
          io.to(user.room).emit("message", formatMessage(botName, `${userId} has left the chat`));
        }
      });
    });
  });
};

function findUserSocket(userId) {
  const user = getCurrentUser(userId);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}

process.on("SIGINT", async () => {
  await redisClient.quit();
  console.log("Redis client disconnected");
  process.exit(0);
});

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

    try {
      const [savedMessage, conversation] = await Promise.all([
        newMessage.save(),
        Conversation.findByIdAndUpdate(
          conversationId,
          { $push: { messages: newMessage._id } },
          { new: true }
        ).lean().exec()
      ]);

      const recipientIds = conversation.participants.filter(id => id.toString() !== socket.decoded.userId);

      const sendPromises = recipientIds.map(async (recipientId) => {
        const recipientSocket = findUserSocket(recipientId);
        if (recipientSocket) {
          io.to(recipientSocket.id).emit("newMessage", {
            conversationId,
            message: formatMessage(socket.decoded.userId, message),
          });
        } else {
          await redisClient.rpush(
            `offlineMessages:${recipientId}`,
            JSON.stringify({
              conversationId,
              sender: socket.decoded.userId,
              text: message,
            })
          );
        }
      });

      await Promise.all(sendPromises);

      io.to(conversationId).emit("newMessage", {
        conversationId,
        message: formatMessage(socket.decoded.userId, message),
      });
    } catch (err) {
      console.error("Error processing message:", err);
    }
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
