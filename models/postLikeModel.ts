import mongoose from "mongoose";
const Schema = mongoose.Schema;

// One row per user per post; the unique index makes likes idempotent.
const postLikeSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

postLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
postLikeSchema.index({ userId: 1, createdAt: -1 });

const PostLike = mongoose.model("PostLike", postLikeSchema);

export default PostLike;
