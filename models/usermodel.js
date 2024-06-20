const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define a Mongoose schema for user profiles
const userSchema = new mongoose.Schema({
  // Basic demographics
  firstName: { type: String, required: true, trim: true, maxlength: 50 },
  lastName: { type: String, required: true, trim: true, maxlength: 50 },
  username: { type: String, required: true, unique: true, trim: true, maxlength: 50 },
  age: { type: Number, required: true, min: 18, max: 120 },
  gender: { type: String, enum: ["male", "female", "non-binary", "other"], required: true },
  location: { type: String, trim: true, maxlength: 100 },
  sexualOrientation: { type: String, enum: ["straight", "gay", "lesbian", "bisexual"], required: true },
  
  // Personal interests
  hobbies: [{ type: String, trim: true, maxlength: 50 }],
  interests: [{ type: String, trim: true, maxlength: 50 }],
  passions: [{ type: String, trim: true, maxlength: 50 }],

  // Relationship preferences
  relationshipType: { type: String, enum: ["long-term", "casual", "friendship", "one-night", "short-term", "other"], required: true },

  // Physical attributes
  height: { type: Number, min: 100, max: 250 },
  bodyType: { type: [String], enum: ["slim", "athletic", "average", "muscular", "curvy", "other"], required: true, validate: {
    validator: function (arr) { return arr.length <= 5; },
    message: "Body type array must contain up to 5 values",
  }},
  mobileNumber: { type: String, required: true, unique: true, validate: {
    validator: function (v) { return /^\d{10}$/.test(v); },
    message: (props) => `${props.value} is not a valid phone number!`,
  }},

  // Lifestyle habits
  smoking: { type: Boolean, default: false },
  drinking: { type: Boolean, default: false },
  exerciseFrequency: { type: String, enum: ["never", "occasionally", "regularly", "frequently"] },
  dietaryPreferences: [{ type: String, trim: true, maxlength: 50 }],

  // Values and beliefs
  religiousAffiliation: { type: String, trim: true, maxlength: 50 },
  politicalViews: { type: String, trim: true, maxlength: 50 },
  culturalBackground: { type: String, trim: true, maxlength: 50 },

  // Personality traits
  introversionExtraversion: { type: String, enum: ["low", "average", "high"] },
  openness: { type: String, enum: ["low", "average", "high"] },
  conscientiousness: { type: String, enum: ["low", "average", "high"] },
  emotionalStability: { type: String, enum: ["low", "average", "high"] },
  agreeableness: { type: String, enum: ["low", "average", "high"] },

  // Relationship history
  maritalStatus: { type: String, enum: ["single", "married", "divorced", "widowed", "other"], default: "single" },
  hasChildren: { type: Boolean, default: false },

  // Preferences in potential matches
  matchPreferences: {
    minAge: { type: Number, min: 18, max: 120 },
    maxAge: { type: Number, min: 18, max: 120 },
    maxDistance: { type: Number, min: 0, max: 10000 },
    minHeight: { type: Number, min: 100, max: 250 },
    maxHeight: { type: Number, min: 100, max: 250 },
    bodyTypes: [{ type: String, enum: ["slim", "athletic", "average", "muscular", "curvy", "other"] }],
    personalityTraits: {
      introversionExtraversion: { type: String, enum: ["low", "average", "high"] },
      openness: { type: String, enum: ["low", "average", "high"] },
      conscientiousness: { type: String, enum: ["low", "average", "high"] },
      emotionalStability: { type: String, enum: ["low", "average", "high"] },
      agreeableness: { type: String, enum: ["low", "average", "high"] },
    },
  },

  // Safety and security
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, validate: {
    validator: function (v) { return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v); },
    message: (props) => `${props.value} is not a valid email address!`,
  }},
  emailVerificationToken: { type: String },
  password: { type: String, required: true, minlength: 8 },
  isEmailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean },
  otp: { type: String, default: null },

  // Chat-related fields
  chats: [{
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    messages: [{
      sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
      content: { type: String, required: true, trim: true, maxlength: 1000 },
      timestamp: { type: Date, default: Date.now },
    }],
  }],

  // Security and encryption fields
  encryptionKey: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // Post interactions
  comments: [{ content: { type: String, required: true }, postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true } }],
  likes: [{ postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true } }],
  shares: [{ postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true } }]
});

// Create indexes on specified fields for efficient searching and matching
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
userSchema.index({ "matchPreferences.personalityTraits.introversionExtraversion": 1 });
userSchema.index({ "matchPreferences.personalityTraits.openness": 1 });
userSchema.index({ "matchPreferences.personalityTraits.conscientiousness": 1 });
userSchema.index({ "matchPreferences.personalityTraits.emotionalStability": 1 });
userSchema.index({ "matchPreferences.personalityTraits.agreeableness": 1 });

userSchema.post("save", async function () {
  // Index the user profile in Algolia
  const user = this.toObject();
  user.objectID = user._id.toString();
  await index.saveObject(user);
  console.log("User indexed in Algolia:", user);
});

userSchema.post("remove", async function () {
  // Remove the user profile from Algolia
  await index.deleteObject(this._id.toString());
  console.log("User removed from Algolia:", this._id.toString());
});

// Create a Mongoose model using the schema
const User = mongoose.model("User", userSchema);

module.exports = User;
