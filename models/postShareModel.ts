import mongoose from "mongoose";
const Schema = mongoose.Schema;

// One row per user per post; the unique index makes shares idempotent.
const postShareSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

postShareSchema.index({ postId: 1, userId: 1 }, { unique: true });
postShareSchema.index({ userId: 1, createdAt: -1 });

const PostShare = mongoose.model("PostShare", postShareSchema);

export default PostShare;
