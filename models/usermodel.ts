import mongoose from "mongoose";
import { index, SEARCHABLE_FIELDS, toAlgoliaRecord } from "../utils/algolia";

const LEVELS = ["low", "average", "high"];
const BODY_TYPES = ["slim", "athletic", "average", "muscular", "curvy", "other"];
export const RELATIONSHIP_TYPES = ["long-term", "casual", "friendship", "one-night", "short-term", "other"];
export const AUTH_PROVIDERS = ["password", "google"] as const;

// Accounts that signed up with a password must have a full profile at sign-up.
// Google accounts start with only what Google gives us and fill the rest in later.
function requiredForPasswordAccounts(this: any) {
  return !this.googleId;
}

const userSchema = new mongoose.Schema(
  {
    // Identity and sign-in
    username: { type: String, required: true, unique: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
        message: (props: { value: string }) => `${props.value} is not a valid email address!`,
      },
    },
    authProviders: { type: [String], enum: AUTH_PROVIDERS, default: undefined },
    password: { type: String, required: requiredForPasswordAccounts, minlength: 8 },
    googleId: { type: String, unique: true, sparse: true },
    mobileNumber: {
      type: String,
      unique: true,
      sparse: true,
      required: requiredForPasswordAccounts,
      validate: {
        validator: (v: string) => /^\d{10}$/.test(v),
        message: (props: { value: string }) => `${props.value} is not a valid phone number!`,
      },
    },

    // Profile
    firstName: { type: String, required: requiredForPasswordAccounts, trim: true, maxlength: 50 },
    lastName: { type: String, required: requiredForPasswordAccounts, trim: true, maxlength: 50 },
    displayName: { type: String, trim: true, maxlength: 100 },
    profilePicture: { type: String },
    age: { type: Number, required: requiredForPasswordAccounts, min: 18, max: 120 },
    gender: { type: String, enum: ["male", "female", "non-binary", "other"], required: requiredForPasswordAccounts },
    sexualOrientation: { type: String, enum: ["straight", "gay", "lesbian", "bisexual"], required: requiredForPasswordAccounts },
    relationshipType: { type: String, enum: RELATIONSHIP_TYPES, required: requiredForPasswordAccounts },
    location: { type: String, trim: true, maxlength: 100 },
    // GeoJSON point, coordinates are [longitude, latitude]
    geo: {
      type: { type: String, enum: ["Point"] },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: {
          validator: (c: number[]) => c.length === 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90,
          message: "geo.coordinates must be [longitude, latitude]",
        },
      },
    },

    // Personal interests
    hobbies: [{ type: String, trim: true, maxlength: 50 }],
    interests: [{ type: String, trim: true, maxlength: 50 }],
    passions: [{ type: String, trim: true, maxlength: 50 }],

    // Physical attributes
    height: { type: Number, min: 100, max: 250 },
    bodyType: {
      type: [String],
      enum: BODY_TYPES,
      default: undefined,
      required: requiredForPasswordAccounts,
      validate: {
        validator: (arr: string[]) => arr.length <= 5,
        message: "Body type array must contain up to 5 values",
      },
    },

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
    introversionExtraversion: { type: String, enum: LEVELS },
    openness: { type: String, enum: LEVELS },
    conscientiousness: { type: String, enum: LEVELS },
    emotionalStability: { type: String, enum: LEVELS },
    agreeableness: { type: String, enum: LEVELS },

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
      bodyTypes: [{ type: String, enum: BODY_TYPES }],
      personalityTraits: {
        introversionExtraversion: { type: String, enum: LEVELS },
        openness: { type: String, enum: LEVELS },
        conscientiousness: { type: String, enum: LEVELS },
        emotionalStability: { type: String, enum: LEVELS },
        agreeableness: { type: String, enum: LEVELS },
      },
    },

    // Activity: only people seen recently are offered as matches.
    lastActiveAt: { type: Date, default: Date.now },

    // Verification and recovery
    emailVerificationToken: { type: String },
    isEmailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean },
    otp: { type: String, default: null },
    otpExpires: { type: Date },
    encryptionKey: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true }
);

// Matching runs $geoNear on this index, filtering by gender, age and activity
// inside the same index scan. It must stay the only 2dsphere index on users.
userSchema.index({ geo: "2dsphere", gender: 1, age: 1, lastActiveAt: -1 });
// Matching for people without coordinates, and the nightly refresh sweep.
userSchema.index({ lastActiveAt: -1 });

async function syncToAlgolia(doc: any) {
  if (!doc) return;
  try {
    const user = typeof doc.toObject === "function" ? doc.toObject() : doc;
    await index.saveObject(toAlgoliaRecord(user));
  } catch (error) {
    console.error("Error indexing user in Algolia:", error);
  }
}

userSchema.post("save", function (doc) {
  syncToAlgolia(doc);
});

// Profile edits go through findByIdAndUpdate, which skips the save hook. Only
// re-index when a searchable field changed (not on OTP or token updates).
const SEARCHABLE = new Set<string>(SEARCHABLE_FIELDS);
userSchema.post("findOneAndUpdate", function (this: any, doc) {
  const update = this.getUpdate() ?? {};
  const changed = [...Object.keys(update), ...Object.keys(update.$set ?? {})];
  if (changed.some((field) => SEARCHABLE.has(field))) syncToAlgolia(doc);
});

userSchema.post("deleteOne", { document: true, query: false }, async function (this: any) {
  try {
    await index.deleteObject(this._id.toString());
  } catch (error) {
    console.error("Error removing user from Algolia:", error);
  }
});

const User = mongoose.model("User", userSchema);

export default User;
