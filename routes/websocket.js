const jwt = require("jsonwebtoken");
const formatMessage = require("../utils/message");
const { userJoin, userLeave } = require("../utils/user");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");

const botName = "Frankie Socket";

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
            socket.emit("message", formatMessage(message.sender, message.text));
          });
        }
      } catch (err) {
        console.error("Error fetching conversation:", err);
      }

      socket.broadcast
        .to(user.room)
        .emit(
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
