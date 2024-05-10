// chatService.js

const Ably = require("ably");
const ably = new Ably.Realtime(process.env.ABLY_API_KEY);

// Establish connection to Ably
const connectToAbly = async () => {
  try {
    await ably.connection.once("connected");
    console.log("Connected to Ably!");
  } catch (err) {
    console.error("Error connecting to Ably:", err);
  }
};

// Subscribe to a channel
const subscribeToChannel = async () => {
  try {
    const channel = ably.channels.get("quickstart");

    await channel.subscribe("greeting", (message) => {
      console.log("Received a greeting message in realtime:", message.data);
    });
  } catch (err) {
    console.error("Error subscribing to channel:", err);
  }
};

// Publish a message to a channel
const publishMessage = async () => {
  try {
    const channel = ably.channels.get("quickstart");

    await channel.publish("greeting", "hello!");
    console.log("Message published successfully!");
  } catch (err) {
    console.error("Error publishing message:", err);
  }
};

// Close the connection to Ably
const closeAblyConnection = () => {
  ably.close();
  console.log("Closed the connection to Ably.");
};

module.exports = {
  connectToAbly,
  subscribeToChannel,
  publishMessage,
  closeAblyConnection,
};
