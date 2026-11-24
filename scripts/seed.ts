import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/usermodel";
import Swipe from "../models/swipeModel";
import { clearAllLists } from "../utils/matchStore";
import { closeRedis } from "../utils/redis";
import { hashPassword } from "../utils/password";

dotenv.config();

// Shared password for every seeded account (bcrypt-hashed, same as /api/register).
const TEST_PASSWORD = "Password123";
const EMAIL_DOMAIN = "seed.tst";

const uri = process.env.MONGODB_URI ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri)) {
  console.error("Refusing to seed: MONGODB_URI must point at a local MongoDB.");
  process.exit(1);
}

const firstNames = {
  female: ["Ama", "Efua", "Akosua", "Naa", "Abena", "Esi", "Adwoa", "Maame", "Yaa", "Serwaa"],
  male: ["Kwame", "Kofi", "Yaw", "Kwesi", "Kojo", "Nii", "Kweku", "Fiifi", "Nana", "Mensah"],
  "non-binary": ["Sam", "Alex", "Jordan", "Riley", "Quinn"],
} as const;
const lastNames = ["Mensah", "Owusu", "Boateng", "Asante", "Addo", "Tetteh", "Ofori", "Appiah", "Darko", "Quaye"];
// City centres as [longitude, latitude].
const cities: Record<string, [number, number]> = {
  Accra: [-0.187, 5.6037],
  Kumasi: [-1.6244, 6.6885],
  Takoradi: [-1.7604, 4.8975],
  Tamale: [-0.8393, 9.4008],
};
const locations = Object.keys(cities);
const interestPool = ["hiking", "music", "cooking", "football", "reading", "travel", "movies", "gaming", "art", "fitness", "dancing", "photography"];
const bodyTypes = ["slim", "athletic", "average", "muscular", "curvy"] as const;
const relationshipTypes = ["long-term", "long-term", "short-term", "casual", "friendship", "one-night", "other"] as const;
const levels = ["low", "average", "high"] as const;

// Small deterministic generator so reseeding gives the same data.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pickMany = <T>(arr: readonly T[], n: number): T[] =>
  [...arr].sort(() => rand() - 0.5).slice(0, n);

function orientationFor(gender: string): string {
  const r = rand();
  if (gender === "female") return r < 0.7 ? "straight" : r < 0.85 ? "lesbian" : "bisexual";
  if (gender === "male") return r < 0.7 ? "straight" : r < 0.85 ? "gay" : "bisexual";
  return "bisexual";
}

function buildUsers(count: number, hashed: string) {
  const genders = ["female", "male", "non-binary"] as const;

  return Array.from({ length: count }, (_, i) => {
    const gender = i % 12 === 11 ? "non-binary" : genders[i % 2];
    const firstName = pick(firstNames[gender]);
    const lastName = pick(lastNames);
    const age = between(20, 45);
    const minAge = Math.max(18, age - between(3, 8));
    const maxAge = age + between(3, 10);
    const username = `${firstName}${lastName}${i}`.toLowerCase();
    const location = pick(locations);
    // Spread people up to ~15 km around the city centre.
    const [lng, lat] = cities[location];
    const coordinates = [lng + (rand() - 0.5) * 0.27, lat + (rand() - 0.5) * 0.27];

    return {
      firstName,
      lastName,
      username,
      email: `${username}@${EMAIL_DOMAIN}`,
      password: hashed,
      mobileNumber: String(2000000000 + i * 7919).padStart(10, "0").slice(0, 10),
      age,
      gender,
      sexualOrientation: orientationFor(gender),
      relationshipType: pick(relationshipTypes),
      location,
      geo: { type: "Point", coordinates },
      height: between(150, 195),
      bodyType: [pick(bodyTypes)],
      hobbies: pickMany(interestPool, 3),
      interests: pickMany(interestPool, 2),
      smoking: rand() < 0.15,
      drinking: rand() < 0.4,
      exerciseFrequency: pick(["never", "occasionally", "regularly", "frequently"] as const),
      introversionExtraversion: pick(levels),
      openness: pick(levels),
      conscientiousness: pick(levels),
      emotionalStability: pick(levels),
      agreeableness: pick(levels),
      isEmailVerified: true,
      authProviders: ["password"],
      // Mostly recent, but some beyond the 30-day activity window so matching skips them.
      lastActiveAt: new Date(Date.now() - between(0, 45) * 24 * 60 * 60 * 1000),
      phoneVerified: true,
      matchPreferences: {
        minAge,
        maxAge,
        minHeight: 150,
        maxHeight: 200,
        bodyTypes: pickMany(bodyTypes, 3),
        maxDistance: pick([50, 300, 800]),
      },
    };
  });
}

async function main() {
  await mongoose.connect(uri);

  const old = await User.find({ email: { $regex: `@${EMAIL_DOMAIN}$` } }).select("_id").lean();
  const oldIds = old.map((u) => u._id);
  await Swipe.deleteMany({ $or: [{ swiper: { $in: oldIds } }, { target: { $in: oldIds } }] });
  const removed = await User.deleteMany({ _id: { $in: oldIds } });
  // insertMany skips the document "save" hook, so nothing is sent to Algolia.
  const created = await User.insertMany(buildUsers(80, await hashPassword(TEST_PASSWORD)));
  // Reseeding replaces user ids, so stored match lists would point at deleted users.
  await clearAllLists();
  await closeRedis();

  console.log(`Removed ${removed.deletedCount} old seed users, created ${created.length}.`);
  console.log(`Log in with any ${EMAIL_DOMAIN} email, e.g. ${created[0].email}, password: ${TEST_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
