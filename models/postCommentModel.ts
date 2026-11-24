import mongoose from "mongoose";
const Schema = mongoose.Schema;

const postCommentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Comment cannot exceed 200 characters"],
    },
  },
  { timestamps: true }
);

// Comments for a post, newest first (paginated by createdAt).
postCommentSchema.index({ postId: 1, createdAt: -1 });

const PostComment = mongoose.model("PostComment", postCommentSchema);

export default PostComment;
