import { createHash, randomBytes } from "crypto";
import { collections } from "./db";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const RESET_TOKEN_BYTES = 32;

export function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Create a one-time reset token for an email. Returns the RAW token (only copy). */
export async function createResetToken(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const raw = randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const col = await collections.passwordResets();
  const now = new Date();
  // Invalidate any previous unused tokens for this email.
  await col.deleteMany({ email: normalized, usedAt: { $exists: false } });
  await col.insertOne({
    email: normalized,
    tokenHash: sha256Hex(raw),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    createdAt: now,
  });
  // Best-effort cleanup of expired tokens.
  await col.deleteMany({ expiresAt: { $lt: now } }).catch(() => undefined);
  return raw;
}

/** Look up a raw token. Returns the email if valid, else null. */
export async function verifyResetToken(raw: string): Promise<string | null> {
  const token = String(raw || "").trim();
  if (!token) return null;
  const col = await collections.passwordResets();
  const doc = await col.findOne({ tokenHash: sha256Hex(token) });
  if (!doc) return null;
  if (doc.usedAt) return null;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return null;
  return doc.email;
}

/** Consume (single-use) a raw token. Returns the email if valid, else null. */
export async function consumeResetToken(raw: string): Promise<string | null> {
  const email = await verifyResetToken(raw);
  if (!email) return null;
  const col = await collections.passwordResets();
  await col.deleteMany({ email });
  return email;
}

export function resetLinkFor(baseUrl: string, rawToken: string): string {
  const base = (baseUrl || "").replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function appBaseUrl(reqUrl?: string): string {
  const env = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (env) return env;
  if (reqUrl) {
    try {
      const u = new URL(reqUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}
