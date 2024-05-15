const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    sender: { type: Schema.Types.ObjectId, ref: "User" },
    text: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[\w\s,.!?]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid message text!`,
      },
    },
    createdAt: { type: Date, default: Date.now },
  },

  {
    indexes: [
      { fields: ["conversationId", "createdAt"] },
      { fields: ["sender", "createdAt"] },
    ],
  }
);

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
