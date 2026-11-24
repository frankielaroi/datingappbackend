import { Types } from "mongoose";
import User from "../models/usermodel";
import { redisClient } from "./redis";
import { scheduleRefresh } from "./matchQueue";
import {
  ACTIVE_WINDOW_DAYS,
  Profile,
  RankedMatch,
  loadCandidates,
  mutualScore,
  rankCandidates,
  stillCompatible,
  toPublicMatch,
} from "./matching";
import { PRIVATE_FIELDS } from "./userFields";

/**
 * Pre-computed match lists.
 *
 * Each user's ranked candidates are kept in a Redis sorted set
 * (`ml:<userId>`, best first). Serving a request is then a Redis read plus a
 * fetch of ~10 profiles by id, instead of a geo query and scoring hundreds
 * of people. Lists are rebuilt when they expire, run out, or when someone
 * nearby changes their profile (area invalidation).
 *
 * Lists can go stale between rebuilds, so every entry is re-checked against
 * both people's current profiles before it is shown.
 */

const LIST_SIZE = 200;
const LIST_TTL_SECONDS = 24 * 60 * 60;
// Strict matches are stored with this bonus so they always sort above relaxed ones.
const STRICT_BONUS = 1000;
// A profile change refreshes lists of active users within this radius.
const AREA_RADIUS_KM = 200;
const AREA_MAX_USERS = 10000;
// Fetch extra entries per request to absorb ones that fail re-checking.
const OVERFETCH = 3;

const listKey = (id: string) => `ml:${id}`;
const builtKey = (id: string) => `ml:${id}:built`;
const MATCH_SELECT = PRIVATE_FIELDS.replace(" -geo", "");

export async function buildList(requester: Profile): Promise<RankedMatch[]> {
  const id = String(requester._id);
  const ranked = rankCandidates(requester, await loadCandidates(requester), LIST_SIZE);

  const tx = redisClient.multi().del(listKey(id));
  if (ranked.length) {
    tx.zAdd(
      listKey(id),
      ranked.map((r) => ({
        score: r.score + (r.outsidePreferences ? 0 : STRICT_BONUS),
        value: String(r.match._id),
      }))
    ).expire(listKey(id), LIST_TTL_SECONDS);
  }
  // The marker exists even for an empty list, so "no matches" is cached too.
  tx.set(builtKey(id), String(Date.now()), { EX: LIST_TTL_SECONDS });
  await tx.exec();
  return ranked;
}

async function readList(requester: Profile, limit: number): Promise<{ valid: RankedMatch[]; remaining: number }> {
  const id = String(requester._id);
  const entries = await redisClient.zRangeWithScores(listKey(id), 0, limit * OVERFETCH - 1, { REV: true });
  if (!entries.length) return { valid: [], remaining: 0 };

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const docs = await User.find({
    _id: { $in: entries.map((e) => new Types.ObjectId(e.value)) },
    lastActiveAt: { $gte: activeSince },
  })
    .select(MATCH_SELECT)
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const valid: RankedMatch[] = [];
  const stale: string[] = [];
  for (const entry of entries) {
    const doc = byId.get(entry.value);
    const outsidePreferences = entry.score < STRICT_BONUS;
    if (doc && stillCompatible(requester, doc, outsidePreferences)) {
      if (valid.length < limit) valid.push({ match: doc, score: mutualScore(requester, doc), outsidePreferences });
    } else {
      stale.push(entry.value);
    }
  }
  if (stale.length) await redisClient.zRem(listKey(id), stale);
  const remaining = await redisClient.zCard(listKey(id));
  return { valid, remaining };
}

export async function getMatches(requester: Profile, limit = 10) {
  const id = String(requester._id);
  let ranked: RankedMatch[];

  if (!(await redisClient.exists(builtKey(id)))) {
    ranked = (await buildList(requester)).slice(0, limit);
  } else {
    const { valid, remaining } = await readList(requester, limit);
    ranked = valid;
    if (!valid.length && remaining === 0) {
      // List used up (everyone swiped or no longer valid): rebuild now.
      ranked = (await buildList(requester)).slice(0, limit);
    } else if (remaining < limit * OVERFETCH) {
      // Running low: rebuild in the background for next time.
      scheduleRefresh(id);
    }
  }
  return ranked.map((r) => toPublicMatch(requester, r));
}

// Someone the user has swiped on shouldn't come back.
export async function removeFromList(userId: string, targetId: string) {
  await redisClient.zRem(listKey(userId), targetId);
}

export async function invalidateUser(userId: string) {
  await redisClient.del([listKey(userId), builtKey(userId)]);
}

// A profile change can make someone a new match for people nearby, so their
// lists are marked for rebuild (lazily: on their next request). Lists of
// people further away pick the change up when they expire.
export async function invalidateArea(user: Profile | null | undefined) {
  if (!user) return;
  await invalidateUser(String(user._id));
  if (user.geo?.coordinates?.length !== 2) return;

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const nearby = await User.find({
    geo: { $nearSphere: { $geometry: user.geo, $maxDistance: AREA_RADIUS_KM * 1000 } },
    lastActiveAt: { $gte: activeSince },
  })
    .select("_id")
    .limit(AREA_MAX_USERS)
    .lean();
  const keys = nearby.map((u) => builtKey(String(u._id)));
  for (let i = 0; i < keys.length; i += 500) {
    await redisClient.del(keys.slice(i, i + 500));
  }
}

// Drop every stored list (used by the seed script).
export async function clearAllLists() {
  const keys: string[] = [];
  for await (const batch of redisClient.scanIterator({ MATCH: "ml:*", COUNT: 1000 })) {
    keys.push(...(Array.isArray(batch) ? batch : [batch]));
  }
  for (let i = 0; i < keys.length; i += 500) await redisClient.del(keys.slice(i, i + 500));
}
