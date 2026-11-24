import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Messages live in their own collection (see messageModel), keyed by
// conversationId, so a conversation document never grows with chat history.
const conversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    lastMessageAt: { type: Date, index: true },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
