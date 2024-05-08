const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the Post schema
const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "Author ID is required"],
    },
    content: {
      type: String,
      required: [true, "Post content is required"],
      index: true, // Add index for searching content
      trim: true, // Trim whitespace from content
      maxlength: [500, "Post content cannot exceed 500 characters"], // Limit content length
    },
    images: [
      {
        type: String,
        validate: {
          validator: function (value) {
            return (
              value.startsWith("https://") ||
              value.startsWith("http://") ||
              value.startsWith("data:image/jpeg;base64,")
            );
          },
          message: (props) =>
            `${props.value} is not a valid URL or base64 image data`,
        },
        // Define any additional properties for images
      },
    ],
    shares: [
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User", // Reference to the User model
      },
    },
  ],
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User", // Reference to the User model
      },
    ],
    comments: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User", // Reference to the User model
          required: true,
        },
        content: {
          type: String,
          required: true,
          index: true, // Add index for searching comment content
          trim: true, // Trim whitespace from comment content
          maxlength: [200, "Comment cannot exceed 200 characters"], // Limit comment length
        },
        createdAt: {
          type: Date,
          default: Date.now,
          index: true, // Index for sorting comments by creation date
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true, // Add index for searching by date
    },
  },
  {
    timestamps: true, // Add createdAt and updatedAt fields automatically
    toJSON: { virtuals: true }, // Include virtual properties when converting to JSON
    toObject: { virtuals: true }, // Include virtual properties when converting to Object
  }
);

// Add a virtual property to get the total number of likes
postSchema.virtual("totalLikes").get(function () {
  return this.likes.length;
});

// Add a virtual property to get the total number of comments
postSchema.virtual("totalComments").get(function () {
  return this.comments.length;
});

// Create a Post model based on the schema
const Post = mongoose.model("Post", postSchema);

module.exports = Post;
