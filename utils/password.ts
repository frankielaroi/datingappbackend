import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;
const LEGACY_SHA256 = /^[a-f0-9]{64}$/;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// Accounts created before bcrypt store an unsalted SHA-256 hex digest. Those
// still verify, and `needsRehash` tells the caller to upgrade them to bcrypt.
export async function verifyPassword(
  plain: string,
  stored: string | undefined | null
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored) return { valid: false, needsRehash: false };
  if (LEGACY_SHA256.test(stored)) {
    const digest = crypto.createHash("sha256").update(plain).digest("hex");
    const valid = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(stored));
    return { valid, needsRehash: valid };
  }
  return { valid: await bcrypt.compare(plain, stored), needsRehash: false };
}

export function isAcceptablePassword(plain: unknown): plain is string {
  return typeof plain === "string" && plain.length >= MIN_PASSWORD_LENGTH && plain.length <= 128;
}

// Reset tokens are stored hashed so a database leak can't be used to reset accounts.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
