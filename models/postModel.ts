import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Likes, comments and shares live in their own collections (postLikeModel,
// postCommentModel, postShareModel). The post only keeps counters, updated
// with $inc, so popular posts don't turn into huge documents.
const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author ID is required"],
    },
    content: {
      type: String,
      required: [true, "Post content is required"],
      trim: true,
      maxlength: [500, "Post content cannot exceed 500 characters"],
    },
    images: [
      {
        type: String,
        validate: {
          validator: (value: string) => /^(https?:\/\/|data:image\/jpeg;base64,)/.test(value),
          message: (props: { value: string }) => `${props.value} is not a valid URL or base64 image data`,
        },
      },
    ],
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    sharesCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

postSchema.index({ content: "text" });
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });

const Post = mongoose.model("Post", postSchema);

export default Post;
