const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define a Mongoose schema for user profiles
const userSchema = new mongoose.Schema({
  // Basic demographics
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  username: {
    type: String,
    required: true,
    unique: true, // Ensures each username is unique
    trim: true,
    maxlength: 50,
  },
  age: {
    type: Number,
    required: true,
    min: 18, // Minimum age is 18
    max: 120, // Maximum age is 120
  },
  gender: {
    type: String,
    enum: ["male", "female", "non-binary", "other"], // Allowed gender values
    required: true,
  },
  location: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  sexualOrientation: {
    type: String,
    enum: ["straight", "gay", "lesbian", "bisexual"], // Allowed sexual orientation values
    required: true,
  },

  // Personal interests
  hobbies: [
    {
      type: String,
      trim: true,
      maxlength: 50,
    },
  ],
  interests: [
    {
      type: String,
      trim: true,
      maxlength: 50,
    },
  ],
  passions: [
    {
      type: String,
      trim: true,
      maxlength: 50,
    },
  ],

  // Relationship preferences
  relationshipType: {
    type: String,
    enum: [
      "long-term",
      "casual",
      "friendship",
      "one-night",
      "short-term",
      "other",
    ], // Allowed relationship type values
    required: true,
  },

  // Physical attributes (optional)
  height: {
    type: Number,
    min: 100, // Minimum height is 100 cm
    max: 250, // Maximum height is 250 cm
  },
  bodyType: {
    type: [String],
    enum: ["slim", "athletic", "average", "muscular", "curvy", "other"], // Allowed body type values
    required: true,
    validate: {
      validator: function (arr) {
        return arr.length <= 5; // Maximum of 5 body types can be selected
      },
      message: "Body type array must contain up to 5 values",
    },
  },
  mobileNumber: {
    type: String,
    required: true,
    unique: true, // Ensures each mobile number is unique
    validate: {
      validator: function (v) {
        return /^\d{10}$/.test(v); // Validates the mobile number format (10 digits)
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
  },

  // Lifestyle habits
  smoking: {
    type: Boolean,
    default: false, // Default value for smoking is false
  },
  drinking: {
    type: Boolean,
    default: false, // Default value for drinking is false
  },
  exerciseFrequency: {
    type: String,
    enum: ["never", "occasionally", "regularly", "frequently"], // Allowed exercise frequency values
  },
  dietaryPreferences: [
    {
      type: String,
      trim: true,
      maxlength: 50,
    },
  ],

  // Values and beliefs
  religiousAffiliation: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  politicalViews: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  culturalBackground: {
    type: String,
    trim: true,
    maxlength: 50,
  },

  // Personality traits
  introversionExtraversion: {
    type: String,
    enum: ["low", "average", "high"], // Allowed introversion/extraversion values
  },
  openness: {
    type: String,
    enum: ["low", "average", "high"], // Allowed openness values
  },
  conscientiousness: {
    type: String,
    enum: ["low", "average", "high"], // Allowed conscientiousness values
  },
  emotionalStability: {
    type: String,
    enum: ["low", "average", "high"], // Allowed emotional stability values
  },
  agreeableness: {
    type: String,
    enum: ["low", "average", "high"], // Allowed agreeableness values
  },

  // Relationship history
  maritalStatus: {
    type: String,
    enum: ["single", "married", "divorced", "widowed", "other"], // Allowed marital status values
    default: "single", // Default marital status is single
  },
  hasChildren: {
    type: Boolean,
    default: false, // Default value for hasChildren is false
  },

  // Preferences in potential matches
  matchPreferences: {
    minAge: {
      type: Number,
      min: 18, // Minimum age preference is 18
      max: 120, // Maximum age preference is 120
    },
    maxAge: {
      type: Number,
      min: 18, // Minimum age preference is 18
      max: 120, // Maximum age preference is 120
    },
    maxDistance: {
      type: Number,
      min: 0, // Minimum distance preference is 0 km
      max: 10000, // Maximum distance preference is 10000 km
    },
    minHeight: {
      type: Number,
      min: 100, // Minimum height preference is 100 cm
      max: 250, // Maximum height preference is 250 cm
    },
    maxHeight: {
      type: Number,
      min: 100, // Minimum height preference is 100 cm
      max: 250, // Maximum height preference is 250 cm
    },
    bodyTypes: [
      {
        type: String,
        enum: ["slim", "athletic", "average", "muscular", "curvy", "other"], // Allowed body type preferences
      },
    ],
    personalityTraits: {
      introversionExtraversion: {
        type: String,
        enum: ["low", "average", "high"], // Allowed introversion/extraversion preferences
      },
      openness: {
        type: String,
        enum: ["low", "average", "high"], // Allowed openness preferences
      },
      conscientiousness: {
        type: String,
        enum: ["low", "average", "high"], // Allowed conscientiousness preferences
      },
      emotionalStability: {
        type: String,
        enum: ["low", "average", "high"], // Allowed emotional stability preferences
      },
      agreeableness: {
        type: String,
        enum: ["low", "average", "high"], // Allowed agreeableness preferences
      },
    },
    // Add more preferences as needed
  },

  // Safety and security
  email: {
    type: String,
    required: true,
    unique: true, // Ensures each email is unique
    trim: true,
    lowercase: true, // Converts email to lowercase
    validate: {
      validator: function (v) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v); // Validates the email format
      },
      message: (props) => `${props.value} is not a valid email address!`,
    },
  },
  emailVerificationToken: {
    type: String,
  },
  password: {
    type: String,
    required: true,
    minlength: 8, // Minimum password length is 8 characters
  },
  isEmailVerified: {
    type: Boolean,
    default: false, // Default value for isEmailVerified is false
  },
  phoneVerified: {
    type: Boolean,
  },
  otp: {
    type: String,
    default: null, // Default value for otp is null
  },
  // Chat-related fields
  chats: [
    {
      recipient: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Reference to the recipient user
      messages: [
        {
          sender: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Reference to the sender user
          content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000, // Maximum message length is 1000 characters
          },
          timestamp: { type: Date, default: Date.now }, // Timestamp of the message
        },
      ],
    },
  ],
  // Security and encryption fields
  encryptionKey: { type: String }, // Store encryption key securely
  //reset tokens
  resetPasswordToken: {
    type: String,
  }, // Add resetPasswordToken field
  resetPasswordExpires: {
    type: Date,
  }, // Add resetPasswordExpires field
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now, // Default value for createdAt is the current date/time
  },
  updatedAt: {
    type: Date,
    default: Date.now, // Default value for updatedAt is the current date/time
  },
   comments: [
    {
      content: { type: String, required: true },
      postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true }
    }
  ],

  // Likes (for posts)
  likes: [
    {
      postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true }
    }
  ],

  // Shared posts
  shares: [
    {
      postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true }
    }
  ]
});

// Create indexes on specified fields

// Indexes for matching and searching
userSchema.index({ firstName: 1 });
userSchema.index({ lastName: 1 });
userSchema.index({ username: 1 });
userSchema.index({ age: 1 });
userSchema.index({ gender: 1 });
userSchema.index({ location: 1 });
userSchema.index({ sexualOrientation: 1 });
userSchema.index({ relationshipType: 1 });
userSchema.index({ bodyType: 1 });
userSchema.index({ smoking: 1 });
userSchema.index({ drinking: 1 });
userSchema.index({ exerciseFrequency: 1 });
userSchema.index({ religiousAffiliation: 1 });
userSchema.index({ politicalViews: 1 });
userSchema.index({ culturalBackground: 1 });
userSchema.index({ introversionExtraversion: 1 });
userSchema.index({ openness: 1 });
userSchema.index({ conscientiousness: 1 });
userSchema.index({ emotionalStability: 1 });
userSchema.index({ agreeableness: 1 });
userSchema.index({ maritalStatus: 1 });
userSchema.index({ hasChildren: 1 });
userSchema.index({ "matchPreferences.minAge": 1 });
userSchema.index({ "matchPreferences.maxAge": 1 });
userSchema.index({ "matchPreferences.maxDistance": 1 });
userSchema.index({ "matchPreferences.minHeight": 1 });
userSchema.index({ "matchPreferences.maxHeight": 1 });
userSchema.index({ "matchPreferences.bodyTypes": 1 });
userSchema.index({
  "matchPreferences.personalityTraits.introversionExtraversion": 1,
});
userSchema.index({ "matchPreferences.personalityTraits.openness": 1 });
userSchema.index({ "matchPreferences.personalityTraits.conscientiousness": 1 });
userSchema.index({
  "matchPreferences.personalityTraits.emotionalStability": 1,
});
userSchema.index({ "matchPreferences.personalityTraits.agreeableness": 1 });

// Create a Mongoose model using the schema
const User = mongoose.model("User", userSchema);

module.exports = User;
