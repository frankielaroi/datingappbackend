const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", index: true },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, "Message text cannot exceed 1000 characters"],
      validate: {
        validator: function (v) {
          return /^[\w\s,.!?]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid message text!`,
      },
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;