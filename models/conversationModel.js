const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const conversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  messages: [{ type: Schema.Types.ObjectId, ref: "Message" }],
  lastMessageAt: { type: Date, index: true },
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
