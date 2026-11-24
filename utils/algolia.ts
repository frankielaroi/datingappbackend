import algoliasearch from "algoliasearch";
import dotenv from "dotenv";
dotenv.config();

const client = algoliasearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_ADMIN_API_KEY
);

export const index = client.initIndex(process.env.ALGOLIA_INDEX_NAME);

export const SEARCHABLE_FIELDS = [
  "username",
  "email",
  "age",
  "gender",
  "location",
  "relationshipType",
  "sexualOrientation",
  "height",
  "bodyType",
  "smoking",
  "drinking",
  "exerciseFrequency",
  "religiousAffiliation",
  "politicalViews",
  "culturalBackground",
  "introversionExtraversion",
  "openness",
  "conscientiousness",
  "emotionalStability",
  "agreeableness",
] as const;

// Only whitelisted profile fields are sent to Algolia (never password, tokens or otp).
export function toAlgoliaRecord(user: Record<string, any>) {
  const record: Record<string, unknown> = { objectID: user._id.toString() };
  for (const field of SEARCHABLE_FIELDS) record[field] = user[field];
  return record;
}
