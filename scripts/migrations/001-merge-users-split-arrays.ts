/**
 * Migration 001: one users collection, no unbounded arrays.
 *
 *  1. Moves every googleusers document into users. If a password account with
 *     the same email already exists, Google is linked to it instead and all
 *     references to the Google id are rewritten to the existing account.
 *  2. Moves post likes/comments/shares arrays into postlikes/postcomments/
 *     postshares and recomputes the post counters.
 *  3. Moves user chats/likes/comments/shares arrays into conversations,
 *     messages and the post collections (skipping copies already moved).
 *  4. Drops conversation.messages (messages already carry conversationId).
 *  5. Fills authProviders/lastActiveAt, removes null phone numbers, renames
 *     googleusers to a backup collection and syncs every model's indexes.
 *
 * Safe to run more than once. Usage:
 *   npm run migrate:001 -- --dry-run      report what would change
 *   npm run migrate:001                   apply (local MongoDB only)
 *   npm run migrate:001 -- --allow-remote apply to a non-local MONGODB_URI
 *
 * Take a backup (mongodump) before running it against real data.
 */
import crypto from "crypto";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import User from "../../models/usermodel";
import Post from "../../models/postModel";
import PostLike from "../../models/postLikeModel";
import PostComment from "../../models/postCommentModel";
import PostShare from "../../models/postShareModel";
import Conversation from "../../models/conversationModel";
import Message from "../../models/messageModel";
import Swipe from "../../models/swipeModel";

dotenv.config();

const DRY = process.argv.includes("--dry-run");
const uriArg = process.argv.find((a) => a.startsWith("--uri="))?.slice(6);
const uri = uriArg ?? process.env.MONGODB_URI ?? "";
const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri);
if (!isLocal && !process.argv.includes("--allow-remote")) {
  console.error("Refusing to migrate a non-local database without --allow-remote.");
  process.exit(1);
}

const stats: Record<string, number> = {};
const bump = (key: string, n = 1) => (stats[key] = (stats[key] ?? 0) + n);

type Doc = Record<string, any>;
const idStr = (v: unknown) => String(v);

// Insert rows, treating duplicate-key errors as "already there".
async function insertIgnoringDuplicates(collection: string, rows: Doc[]): Promise<number> {
  if (!rows.length || DRY) return rows.length;
  try {
    const res = await mongoose.connection.db!.collection(collection).insertMany(rows, { ordered: false });
    return res.insertedCount;
  } catch (error: any) {
    const writeErrors = error?.writeErrors ?? [];
    if (writeErrors.length && writeErrors.every((e: any) => e.code === 11000)) {
      return error.result?.insertedCount ?? rows.length - writeErrors.length;
    }
    throw error;
  }
}

async function uniqueUsername(wanted: string | undefined, email: string): Promise<string> {
  const users = mongoose.connection.db!.collection("users");
  const base = (wanted || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 40) || "user";
  if (!(await users.findOne({ username: base }))) return base;
  return `${base}${crypto.randomBytes(3).toString("hex")}`;
}

// Step 1: googleusers -> users. Returns old Google id -> surviving user id for
// accounts that were linked to an existing password account.
async function mergeGoogleUsers(linkedDocs: Doc[]): Promise<Map<string, Types.ObjectId>> {
  const db = mongoose.connection.db!;
  const users = db.collection("users");
  const remap = new Map<string, Types.ObjectId>();
  const exists = (await db.listCollections({ name: "googleusers" }).toArray()).length > 0;
  if (!exists) return remap;

  for await (const g of db.collection("googleusers").find()) {
    const email = String(g.email ?? "").toLowerCase();
    const sameId = await users.findOne({ _id: g._id });
    if (sameId) {
      bump("google users already merged");
      continue;
    }
    const sameEmail = email ? await users.findOne({ email }) : null;
    if (sameEmail) {
      remap.set(idStr(g._id), sameEmail._id as Types.ObjectId);
      linkedDocs.push({ ...g, _id: sameEmail._id });
      const fill: Doc = { googleId: g.googleId };
      for (const f of ["displayName", "profilePicture"]) if (!sameEmail[f] && g[f]) fill[f] = g[f];
      if (!DRY) {
        await users.updateOne(
          { _id: sameEmail._id },
          { $set: fill, $addToSet: { authProviders: { $each: ["password", "google"] } } }
        );
      }
      bump("google users linked to existing account");
      continue;
    }
    const doc: Doc = { ...g, email, authProviders: ["google"] };
    doc.username = await uniqueUsername(g.username, email);
    if (doc.mobileNumber == null) delete doc.mobileNumber;
    if (!DRY) await users.insertOne(doc);
    bump("google users moved into users");
  }
  return remap;
}

// Step 1b: rewrite references from linked Google ids to the surviving account.
async function remapReferences(remap: Map<string, Types.ObjectId>) {
  if (!remap.size || DRY) return;
  const db = mongoose.connection.db!;
  for (const [oldIdStr, newId] of remap) {
    const oldId = new Types.ObjectId(oldIdStr);
    const ops: [string, Doc, Doc, Doc?][] = [
      ["conversations", { participants: oldId }, { $set: { "participants.$[p]": newId } }, { arrayFilters: [{ p: oldId }] }],
      ["messages", { sender: oldId }, { $set: { sender: newId } }],
      ["posts", { userId: oldId }, { $set: { userId: newId } }],
      ["posts", { likes: oldId }, { $set: { "likes.$[l]": newId } }, { arrayFilters: [{ l: oldId }] }],
      ["posts", { "comments.userId": oldId }, { $set: { "comments.$[c].userId": newId } }, { arrayFilters: [{ "c.userId": oldId }] }],
      ["posts", { "shares.userId": oldId }, { $set: { "shares.$[s].userId": newId } }, { arrayFilters: [{ "s.userId": oldId }] }],
      ["swipes", { swiper: oldId }, { $set: { swiper: newId } }],
      ["swipes", { target: oldId }, { $set: { target: newId } }],
    ];
    for (const [coll, filter, update, options] of ops) {
      const res = await db.collection(coll).updateMany(filter, update, options as any);
      bump(`references remapped in ${coll}`, res.modifiedCount);
    }
  }
}

// Step 2: post arrays -> collections. Returns keys of comments already moved,
// so user.comments copies of the same comment aren't inserted twice.
async function splitPostArrays(): Promise<Set<string>> {
  const db = mongoose.connection.db!;
  const seenComments = new Set<string>();
  const filter = { $or: [{ likes: { $exists: true } }, { comments: { $exists: true } }, { shares: { $exists: true } }] };

  for await (const post of db.collection("posts").find(filter)) {
    const likes = (post.likes ?? []).filter(Boolean).map((userId: unknown) => ({ postId: post._id, userId, createdAt: post.createdAt, updatedAt: post.createdAt }));
    const shares = (post.shares ?? []).filter((s: Doc) => s?.userId).map((s: Doc) => ({ postId: post._id, userId: s.userId, createdAt: post.createdAt, updatedAt: post.createdAt }));
    const comments = (post.comments ?? []).filter((c: Doc) => c?.userId && c?.content).map((c: Doc) => {
      seenComments.add(`${post._id}|${c.userId}|${c.content}`);
      const at = c.createdAt ?? post.createdAt;
      return { postId: post._id, userId: c.userId, content: c.content, createdAt: at, updatedAt: at };
    });

    bump("post likes moved", await insertIgnoringDuplicates("postlikes", likes));
    bump("post shares moved", await insertIgnoringDuplicates("postshares", shares));
    bump("post comments moved", await insertIgnoringDuplicates("postcomments", comments));
    if (!DRY) {
      await db.collection("posts").updateOne({ _id: post._id }, { $unset: { likes: 1, comments: 1, shares: 1 } });
    }
    bump("posts cleaned");
  }
  return seenComments;
}

async function conversationBetween(a: Types.ObjectId, b: Types.ObjectId): Promise<Types.ObjectId | null> {
  const conversations = mongoose.connection.db!.collection("conversations");
  const found = await conversations.findOne({ participants: { $all: [a, b], $size: 2 } });
  if (found) return found._id as Types.ObjectId;
  if (DRY) return null;
  const now = new Date();
  const res = await conversations.insertOne({ participants: [a, b], createdAt: now, updatedAt: now });
  bump("conversations created from chats");
  return res.insertedId as Types.ObjectId;
}

// Step 3: user arrays -> collections.
async function splitUserArrays(seenComments: Set<string>, linkedDocs: Doc[]) {
  const db = mongoose.connection.db!;
  const users = db.collection("users");
  const seenMessages = new Set<string>();
  const filter = {
    $or: [{ chats: { $exists: true } }, { likes: { $exists: true } }, { comments: { $exists: true } }, { shares: { $exists: true } }],
  };
  const docs: AsyncIterable<Doc> | Doc[] = users.find(filter);

  const handle = async (u: Doc, ownerId: Types.ObjectId) => {
    const now = new Date();
    const likes = (u.likes ?? []).filter((l: Doc) => l?.postId).map((l: Doc) => ({ postId: l.postId, userId: ownerId, createdAt: now, updatedAt: now }));
    const shares = (u.shares ?? []).filter((s: Doc) => s?.postId).map((s: Doc) => ({ postId: s.postId, userId: ownerId, createdAt: now, updatedAt: now }));
    const comments = (u.comments ?? [])
      .filter((c: Doc) => c?.postId && c?.content && !seenComments.has(`${c.postId}|${ownerId}|${c.content}`))
      .map((c: Doc) => {
        seenComments.add(`${c.postId}|${ownerId}|${c.content}`);
        return { postId: c.postId, userId: ownerId, content: c.content, createdAt: now, updatedAt: now };
      });
    bump("user likes moved", await insertIgnoringDuplicates("postlikes", likes));
    bump("user shares moved", await insertIgnoringDuplicates("postshares", shares));
    bump("user comments moved", await insertIgnoringDuplicates("postcomments", comments));

    for (const chat of u.chats ?? []) {
      if (!chat?.recipient) continue;
      const conversationId = await conversationBetween(ownerId, chat.recipient);
      const rows = (chat.messages ?? [])
        .filter((m: Doc) => m?.sender && m?.content)
        .filter((m: Doc) => {
          // Both people in a chat may hold a copy of the same messages.
          const key = `${[ownerId, chat.recipient].map(idStr).sort().join("|")}|${m.sender}|${new Date(m.timestamp ?? 0).getTime()}|${m.content}`;
          if (seenMessages.has(key)) return false;
          seenMessages.add(key);
          return true;
        })
        .map((m: Doc) => {
          const at = m.timestamp ?? now;
          return { conversationId, sender: m.sender, text: m.content, status: "read", createdAt: at, updatedAt: at };
        });
      bump("chat messages moved", await insertIgnoringDuplicates("messages", rows));
      if (rows.length && conversationId && !DRY) {
        const last = rows.reduce((a: Date, r: Doc) => (r.createdAt > a ? r.createdAt : a), new Date(0));
        await db.collection("conversations").updateOne(
          { _id: conversationId, $or: [{ lastMessageAt: { $lt: last } }, { lastMessageAt: { $exists: false } }] },
          { $set: { lastMessageAt: last } }
        );
      }
    }
  };

  for await (const u of docs) {
    await handle(u, u._id);
    if (!DRY) await users.updateOne({ _id: u._id }, { $unset: { chats: 1, likes: 1, comments: 1, shares: 1 } });
    bump("users cleaned");
  }
  // Arrays that lived on Google docs linked to an existing account.
  for (const g of linkedDocs) await handle(g, g._id);
}

// Step 4: conversation.messages array -> rely on messages.conversationId.
async function dropConversationMessageArrays() {
  const db = mongoose.connection.db!;
  for await (const c of db.collection("conversations").find({ messages: { $exists: true } })) {
    const ids = (c.messages ?? []).filter(Boolean);
    if (ids.length && !DRY) {
      const res = await db.collection("messages").updateMany(
        { _id: { $in: ids }, conversationId: { $exists: false } },
        { $set: { conversationId: c._id } }
      );
      bump("messages given conversationId", res.modifiedCount);
    }
    if (!c.lastMessageAt && ids.length) {
      const last = await db.collection("messages").find({ _id: { $in: ids } }).sort({ createdAt: -1 }).limit(1).next();
      if (last && !DRY) await db.collection("conversations").updateOne({ _id: c._id }, { $set: { lastMessageAt: last.createdAt } });
    }
    if (!DRY) await db.collection("conversations").updateOne({ _id: c._id }, { $unset: { messages: 1 } });
    bump("conversations cleaned");
  }
}

// Step 5: field defaults and cleanup the new indexes depend on.
async function normaliseUsers() {
  const users = mongoose.connection.db!.collection("users");
  const ops: [string, Doc, Doc][] = [
    ["password accounts given authProviders", { password: { $exists: true }, authProviders: { $exists: false } }, { $set: { authProviders: ["password"] } }],
    // A sparse unique index still indexes explicit nulls, so they must go.
    ["null phone numbers removed", { mobileNumber: { $type: "null" } }, { $unset: { mobileNumber: 1 } }],
    ["null googleIds removed", { googleId: { $type: "null" } }, { $unset: { googleId: 1 } }],
  ];
  for (const [label, filter, update] of ops) {
    const n = await users.countDocuments(filter);
    if (n && !DRY) await users.updateMany(filter, update);
    bump(label, n);
  }
  const missingActivity = { lastActiveAt: { $exists: false } };
  const n = await users.countDocuments(missingActivity);
  if (n && !DRY) await users.updateMany(missingActivity, [{ $set: { lastActiveAt: { $ifNull: ["$updatedAt", "$$NOW"] } } }]);
  bump("users given lastActiveAt", n);
}

async function recomputePostCounters() {
  if (DRY) return;
  const db = mongoose.connection.db!;
  const posts = db.collection("posts");
  for (const [coll, field] of [["postlikes", "likesCount"], ["postcomments", "commentsCount"], ["postshares", "sharesCount"]] as const) {
    await posts.updateMany({}, { $set: { [field]: 0 } });
    for await (const row of db.collection(coll).aggregate([{ $group: { _id: "$postId", n: { $sum: 1 } } }])) {
      await posts.updateOne({ _id: row._id }, { $set: { [field]: row.n } });
    }
  }
}

async function finish() {
  const db = mongoose.connection.db!;
  if ((await db.listCollections({ name: "googleusers" }).toArray()).length && !DRY) {
    const backup = `googleusers_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    await db.collection("googleusers").rename(backup);
    console.log(`googleusers renamed to ${backup} (drop it once you're happy with the migration)`);
  }
  if (DRY) return;
  for (const model of [User, Post, PostLike, PostComment, PostShare, Conversation, Message, Swipe]) {
    const dropped = await (model as any).syncIndexes();
    if (dropped.length) console.log(`${model.modelName}: dropped old indexes ${dropped.join(", ")}`);
  }
}

async function main() {
  await mongoose.connect(uri);
  console.log(`${DRY ? "DRY RUN on" : "Migrating"} ${uri.replace(/\/\/[^@]*@/, "//***@")}`);

  const linkedDocs: Doc[] = [];
  const remap = await mergeGoogleUsers(linkedDocs);
  await remapReferences(remap);
  const seenComments = await splitPostArrays();
  await splitUserArrays(seenComments, linkedDocs);
  await dropConversationMessageArrays();
  await normaliseUsers();
  await recomputePostCounters();
  await finish();

  console.table(stats);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
