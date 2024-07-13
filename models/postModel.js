const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the Post schema
const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "Author ID is required"],
      index: true, // Add index for faster user-based queries
    },
    content: {
      type: String,
      required: [true, "Post content is required"],
      index: 'text', // Use text index for better full-text search
      trim: true,
      maxlength: [500, "Post content cannot exceed 500 characters"],
    },
    images: [
      {
        type: String,
        validate: {
          validator: function (value) {
            return /^(https?:\/\/|data:image\/jpeg;base64,)/.test(value);
          },
          message: (props) =>
            `${props.value} is not a valid URL or base64 image data`,
        },
      },
    ],
    shares: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          index: true, // Add index for faster share-based queries
        },
      },
    ],
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
      index: true, // Add index for faster sorting by likes
    },
    comments: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        content: {
          type: String,
          required: true,
          trim: true,
          maxlength: [200, "Comment cannot exceed 200 characters"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    commentsCount: {
      type: Number,
      default: 0,
      index: true, // Add index for faster sorting by comments
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Use pre-save middleware to update counts
postSchema.pre('save', function(next) {
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  if (this.isModified('comments')) {
    this.commentsCount = this.comments.length;
  }
  next();
});

// Create compound indexes for efficient querying
postSchema.index({ content: 'text', 'comments.content': 'text' });
postSchema.index({ createdAt: -1, likesCount: -1 });
postSchema.index({ createdAt: -1, commentsCount: -1 });
postSchema.index({ userId: 1, createdAt: -1 });

// Create a Post model based on the schema
const Post = mongoose.model("Post", postSchema);

module.exports = Post;