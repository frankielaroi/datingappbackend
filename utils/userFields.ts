// Field lists shared by any route that returns or edits user profiles.

// Never returned to anyone, including the account owner.
export const SECRET_FIELDS =
  "-__v -password -otp -otpExpires -emailVerificationToken -resetPasswordToken -resetPasswordExpires -encryptionKey";

// Hidden from other users on top of the secrets.
export const PRIVATE_FIELDS = `${SECRET_FIELDS} -email -mobileNumber -geo -chats -likes -comments -shares -googleId`;

// What a match card shows about someone else. A whitelist, so new fields stay
// hidden until deliberately added here. Left out on purpose: last name,
// sexual orientation, their match preferences, when they were last online,
// sign-in providers, verification flags and account timestamps.
export const PUBLIC_PROFILE_FIELDS = [
  "_id",
  "username",
  "firstName",
  "displayName",
  "profilePicture",
  "age",
  "gender",
  "location",
  "relationshipType",
  "height",
  "bodyType",
  "hobbies",
  "interests",
  "passions",
  "smoking",
  "drinking",
  "exerciseFrequency",
  "dietaryPreferences",
  "religiousAffiliation",
  "politicalViews",
  "culturalBackground",
  "introversionExtraversion",
  "openness",
  "conscientiousness",
  "emotionalStability",
  "agreeableness",
  "maritalStatus",
  "hasChildren",
] as const;

export function toPublicProfile(user: Record<string, any>): Record<string, unknown> {
  const profile: Record<string, unknown> = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (user[field] !== undefined) profile[field] = user[field];
  }
  return profile;
}

// The same whitelist as a MongoDB $project stage, for aggregations.
export const PUBLIC_PROFILE_PROJECTION = Object.fromEntries(PUBLIC_PROFILE_FIELDS.map((f) => [f, 1]));

// The only fields a user may change through PUT /api/users/:id. Anything
// security-related (password, email, phone, verification flags, tokens) has
// its own flow.
export const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "username",
  "profilePicture",
  "age",
  "gender",
  "location",
  "geo",
  "sexualOrientation",
  "hobbies",
  "interests",
  "passions",
  "relationshipType",
  "height",
  "bodyType",
  "smoking",
  "drinking",
  "exerciseFrequency",
  "dietaryPreferences",
  "religiousAffiliation",
  "politicalViews",
  "culturalBackground",
  "introversionExtraversion",
  "openness",
  "conscientiousness",
  "emotionalStability",
  "agreeableness",
  "maritalStatus",
  "hasChildren",
  "matchPreferences",
] as const;

export function pickEditable(body: unknown): Record<string, unknown> {
  const source = (body ?? {}) as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}
