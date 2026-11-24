import { Types } from "mongoose";
import User from "../models/usermodel";
import Swipe from "../models/swipeModel";
import { PRIVATE_FIELDS } from "./userFields";

export type Profile = Record<string, any>;

// Candidates scored per request: the nearest active people who pass the
// database-side filters. Scoring more barely changes the top results.
const MAX_CANDIDATES = 500;
// People without coordinates, matched by city name instead.
const MAX_CITY_CANDIDATES = 100;
// Only people active this recently are offered as matches.
export const ACTIVE_WINDOW_DAYS = 30;
// Cap on how many past swipes are excluded per request.
const MAX_EXCLUDED_SWIPES = 5000;
// Matching needs coordinates to compute distance; they are removed before results are returned.
const MATCH_SELECT = PRIVATE_FIELDS.replace(" -geo", "");
const MATCH_PROJECTION: Record<string, 0> = Object.fromEntries(
  [...MATCH_SELECT.split(" ").map((f) => f.replace(/^-/, "")), "distanceMeters"].map((f) => [f, 0])
);
const DEFAULT_LIMIT = 10;

// How far age and distance limits may be stretched when strict matching
// returns too few people. Gender/orientation and relationship goals are never
// relaxed, and nobody under 18 is ever included.
export interface Relaxation {
  ageYears: number;
  distanceFactor: number;
}
const STRICT: Relaxation = { ageYears: 0, distanceFactor: 1 };
const FALLBACK_LEVELS: Relaxation[] = [
  { ageYears: 3, distanceFactor: 2 },
  { ageYears: 6, distanceFactor: 4 },
];
// Fallback kicks in when strict matching finds fewer than this many people.
const MIN_STRICT_RESULTS = 3;
const MIN_AGE = 18;


type Gender = "male" | "female" | "non-binary" | "other";

// Genders a person is attracted to. null means no restriction.
export function interestedIn(p: Profile): Gender[] | null {
  const g = p.gender as Gender | undefined;
  const sameOrAny = g === "male" || g === "female" ? [g] : null;
  switch (p.sexualOrientation) {
    case "straight":
      if (g === "male") return ["female"];
      if (g === "female") return ["male"];
      return null;
    case "gay":
      return sameOrAny;
    case "lesbian":
      return ["female"];
    default:
      return null;
  }
}

function genderAccepts(seeker: Profile, candidate: Profile): boolean {
  const allowed = interestedIn(seeker);
  if (!allowed) return true;
  return allowed.includes(candidate.gender);
}

function ageRange(seeker: Profile, relax: Relaxation): [number, number] {
  const prefs = seeker.matchPreferences ?? {};
  return [
    Math.max(MIN_AGE, (prefs.minAge ?? MIN_AGE) - relax.ageYears),
    (prefs.maxAge ?? 120) + relax.ageYears,
  ];
}

function ageAccepts(seeker: Profile, candidate: Profile, relax: Relaxation): boolean {
  const prefs = seeker.matchPreferences ?? {};
  const hasRange = prefs.minAge != null || prefs.maxAge != null;
  if (candidate.age == null) return !hasRange;
  const [min, max] = ageRange(seeker, relax);
  return candidate.age >= min && candidate.age <= max;
}

// Which relationship goals can sensibly be matched with each other.
// "other" (or an unset goal) is open to anything.
const COMPATIBLE_GOALS: Record<string, string[]> = {
  "long-term": ["long-term", "short-term"],
  "short-term": ["short-term", "long-term", "casual"],
  casual: ["casual", "short-term", "one-night"],
  "one-night": ["one-night", "casual"],
  friendship: ["friendship"],
};

function goalsCompatible(a: Profile, b: Profile): boolean {
  const ga = a.relationshipType;
  const gb = b.relationshipType;
  if (!ga || !gb || ga === "other" || gb === "other") return true;
  return COMPATIBLE_GOALS[ga]?.includes(gb) ?? false;
}

const DEFAULT_MAX_DISTANCE_KM = 100;

// Great-circle distance in km, or null when either side has no coordinates.
export function distanceKm(a: Profile, b: Profile): number | null {
  const ca = a.geo?.coordinates;
  const cb = b.geo?.coordinates;
  if (ca?.length !== 2 || cb?.length !== 2) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = ca;
  const [lng2, lat2] = cb;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// People who haven't set a max distance get a default radius, so a search
// never has to scan the whole world.
export const maxDistanceOf = (p: Profile): number =>
  p.matchPreferences?.maxDistance ?? DEFAULT_MAX_DISTANCE_KM;

function distanceAccepts(seeker: Profile, candidate: Profile, relax: Relaxation): boolean {
  const d = distanceKm(seeker, candidate);
  return d == null || d <= maxDistanceOf(seeker) * relax.distanceFactor;
}

// Both people must fit each other's gender, age, distance and relationship-goal requirements.
export function isMutuallyCompatible(a: Profile, b: Profile, relax: Relaxation = STRICT): boolean {
  return (
    genderAccepts(a, b) &&
    genderAccepts(b, a) &&
    ageAccepts(a, b, relax) &&
    ageAccepts(b, a, relax) &&
    distanceAccepts(a, b, relax) &&
    distanceAccepts(b, a, relax) &&
    goalsCompatible(a, b)
  );
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const isSet = (v: unknown) => v !== undefined && v !== null && v !== "";

function overlap(a: unknown, b: unknown): number {
  const sa = new Set(((a as string[]) ?? []).map((x) => String(norm(x))));
  const sb = new Set(((b as string[]) ?? []).map((x) => String(norm(x))));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  sa.forEach((x) => sb.has(x) && shared++);
  return shared / (sa.size + sb.size - shared);
}

const SIMILARITY_WEIGHTS: Record<string, number> = {
  relationshipType: 10,
  smoking: 3,
  drinking: 3,
  exerciseFrequency: 3,
  religiousAffiliation: 2,
  politicalViews: 2,
  culturalBackground: 2,
};

const TRAITS = [
  "introversionExtraversion",
  "openness",
  "conscientiousness",
  "emotionalStability",
  "agreeableness",
] as const;

// Highest raw score scoreCandidate can give, used to turn it into a percentage.
const MAX_RAW_SCORE =
  5 + // height
  5 + // body type
  2 * TRAITS.length + // personality traits
  Object.values(SIMILARITY_WEIGHTS).reduce((a, b) => a + b, 0) +
  10 + // shared interests
  5 + // age closeness
  10; // distance

function proximityScore(seeker: Profile, candidate: Profile): number {
  const d = distanceKm(seeker, candidate);
  if (d != null) {
    return 10 * Math.max(0, 1 - d / Math.max(maxDistanceOf(seeker), 1));
  }
  // No coordinates: fall back to same-city.
  if (isSet(seeker.location) && norm(seeker.location) === norm(candidate.location)) return 10;
  return 0;
}

// How well `candidate` suits `seeker`, 0-100. Fields missing on either side
// earn nothing rather than counting as a match.
export function scoreCandidate(seeker: Profile, candidate: Profile): number {
  const prefs = seeker.matchPreferences ?? {};
  let score = 0;

  // Stated preferences
  if (isSet(candidate.height) && (isSet(prefs.minHeight) || isSet(prefs.maxHeight))) {
    if (candidate.height >= (prefs.minHeight ?? 0) && candidate.height <= (prefs.maxHeight ?? 250)) {
      score += 5;
    }
  }
  if (prefs.bodyTypes?.length && candidate.bodyType?.length) {
    if (candidate.bodyType.some((t: string) => prefs.bodyTypes.includes(t))) score += 5;
  }
  for (const trait of TRAITS) {
    const wanted = prefs.personalityTraits?.[trait];
    if (isSet(wanted) && wanted === candidate[trait]) score += 2;
  }

  // Similarity of profiles
  for (const [field, weight] of Object.entries(SIMILARITY_WEIGHTS)) {
    if (isSet(seeker[field]) && isSet(candidate[field]) && norm(seeker[field]) === norm(candidate[field])) {
      score += weight;
    }
  }
  const seekerInterests = [...(seeker.hobbies ?? []), ...(seeker.interests ?? []), ...(seeker.passions ?? [])];
  const candidateInterests = [...(candidate.hobbies ?? []), ...(candidate.interests ?? []), ...(candidate.passions ?? [])];
  score += 10 * overlap(seekerInterests, candidateInterests);

  // Closer in age is better, up to 10 years apart
  if (isSet(seeker.age) && isSet(candidate.age)) {
    score += 5 * Math.max(0, 1 - Math.abs(seeker.age - candidate.age) / 10);
  }

  score += proximityScore(seeker, candidate);

  return (100 * score) / MAX_RAW_SCORE;
}

// Both directions count: a match one person loves and the other doesn't ranks low.
export function mutualScore(a: Profile, b: Profile): number {
  return Math.sqrt(scoreCandidate(a, b) * scoreCandidate(b, a));
}

export async function findRequester(id: string): Promise<Profile | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return User.findById(id).lean();
}

// Ids the user has already liked or passed, most recent first.
export async function swipedIds(userId: unknown): Promise<Types.ObjectId[]> {
  const rows = await Swipe.find({ swiper: userId })
    .sort({ createdAt: -1 })
    .limit(MAX_EXCLUDED_SWIPES)
    .select("target")
    .lean();
  return rows.map((r) => r.target as Types.ObjectId);
}

const WIDEST = FALLBACK_LEVELS[FALLBACK_LEVELS.length - 1];

// Filters the database can apply cheaply (and inside the geo index scan):
// not me, not already swiped, recently active, an age and gender I'm open to,
// and a compatible relationship goal. The rest is checked per candidate.
function candidateFilter(requester: Profile, exclude: Types.ObjectId[]): Record<string, any> {
  const [minAge, maxAge] = ageRange(requester, WIDEST);
  const filter: Record<string, any> = {
    _id: { $nin: [requester._id, ...exclude] },
    age: { $gte: minAge, $lte: maxAge },
    lastActiveAt: { $gte: new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
  };
  const genders = interestedIn(requester);
  if (genders) filter.gender = { $in: genders };
  const goal = requester.relationshipType;
  if (goal && goal !== "other" && COMPATIBLE_GOALS[goal]) {
    filter.$or = [
      { relationshipType: { $in: [...COMPATIBLE_GOALS[goal], "other"] } },
      { relationshipType: { $exists: false } },
    ];
  }
  return filter;
}

// Nearest-first candidate pool. With coordinates, MongoDB walks the geo index
// outward from the requester, so the pool is the closest eligible people
// rather than an arbitrary slice of the collection.
export async function loadCandidates(requester: Profile): Promise<Profile[]> {
  const filter = candidateFilter(requester, await swipedIds(requester._id));

  if (requester.geo?.coordinates?.length === 2) {
    const radiusKm = maxDistanceOf(requester) * WIDEST.distanceFactor;
    const [nearby, sameCityNoGeo] = await Promise.all([
      User.aggregate([
        {
          $geoNear: {
            near: requester.geo,
            key: "geo",
            distanceField: "distanceMeters",
            spherical: true,
            maxDistance: radiusKm * 1000,
            query: filter,
          },
        },
        { $limit: MAX_CANDIDATES },
        { $project: MATCH_PROJECTION },
      ]),
      requester.location
        ? User.find({ ...filter, "geo.coordinates": { $exists: false }, location: requester.location })
            .select(MATCH_SELECT)
            .sort({ lastActiveAt: -1 })
            .limit(MAX_CITY_CANDIDATES)
            .lean()
        : Promise.resolve([]),
    ]);
    return [...nearby, ...sameCityNoGeo];
  }

  // No coordinates: most recently active eligible people.
  return User.find(filter).select(MATCH_SELECT).sort({ lastActiveAt: -1 }).limit(MAX_CANDIDATES).lean();
}

export interface RankedMatch {
  match: Profile;
  score: number;
  outsidePreferences: boolean;
}

function rankCompatible(requester: Profile, candidates: Profile[], relax: Relaxation) {
  return candidates
    .filter((c) => isMutuallyCompatible(requester, c, relax))
    .map((match) => ({ match, score: mutualScore(requester, match) }))
    .sort((a, b) => b.score - a.score);
}

// Strict matches first. Relaxed ones only top up a short list and are
// flagged so the app can label them.
export function rankCandidates(requester: Profile, candidates: Profile[], limit = DEFAULT_LIMIT): RankedMatch[] {
  const ranked: RankedMatch[] = rankCompatible(requester, candidates, STRICT)
    .slice(0, limit)
    .map((r) => ({ ...r, outsidePreferences: false }));

  if (ranked.length < MIN_STRICT_RESULTS) {
    const seen = new Set(ranked.map((r) => String(r.match._id)));
    for (const level of FALLBACK_LEVELS) {
      if (ranked.length >= MIN_STRICT_RESULTS) break;
      for (const r of rankCompatible(requester, candidates, level)) {
        if (ranked.length >= limit) break;
        const id = String(r.match._id);
        if (seen.has(id)) continue;
        seen.add(id);
        ranked.push({ ...r, outsidePreferences: true });
      }
    }
  }
  return ranked;
}

// Is this still a valid match right now? Used when serving a pre-computed
// list, since either person may have changed since it was built.
export function stillCompatible(requester: Profile, candidate: Profile, outsidePreferences: boolean): boolean {
  return isMutuallyCompatible(requester, candidate, outsidePreferences ? WIDEST : STRICT);
}

export function toPublicMatch(requester: Profile, { match, score, outsidePreferences }: RankedMatch) {
  const d = distanceKm(requester, match);
  const { geo, ...rest } = match; // exact coordinates stay private
  return {
    ...rest,
    matchScore: Math.round(score),
    distanceKm: d == null ? null : Math.max(1, Math.round(d)),
    outsidePreferences,
  };
}

export async function findMatches(requester: Profile, limit = DEFAULT_LIMIT) {
  const candidates = await loadCandidates(requester);
  return rankCandidates(requester, candidates, limit).map((r) => toPublicMatch(requester, r));
}
