// webSocketServer.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');

const messageSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('joinConversation', async (conversationId) => {
      try {
        socket.join(conversationId);
        console.log(`Client joined conversation: ${conversationId}`);
      } catch (error) {
        console.error('Error joining conversation:', error);
      }
    });

    socket.on('sendMessage', async (data) => {
      try {
        const { conversationId, text } = data;
        const token = socket.handshake.auth.token;
        const userId = jwt.verify(token, process.env.JWT_SECRET).userId;

        const message = new Message({
          conversationId,
          sender: userId,
          text,
        });

        const savedMessage = await message.save();

        const conversation = await Conversation.findByIdAndUpdate(
          conversationId,
          {
            $push: { messages: savedMessage._id },
            $set: { updatedAt: Date.now() },
          },
          { new: true }
        );

        io.to(conversationId).emit('newMessage', savedMessage);

        console.log('Message sent successfully');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

module.exports = messageSockets;
