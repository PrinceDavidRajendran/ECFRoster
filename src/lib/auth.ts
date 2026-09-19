import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import bcrypt from "bcryptjs";
import { collections, toObjectId } from "./db";
import type { Role, SafeUser, User } from "./types";

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  role?: Role;
}

// Resolve the session-signing secret. In production a strong secret is
// mandatory — never fall back to a hard-coded value there.
function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error(
        "SESSION_SECRET must be set to a random string of at least 32 characters in production."
      );
    }
    return secret;
  }
  // Development fallback only.
  return secret && secret.length >= 32
    ? secret
    : "DEV_INSECURE_SECRET_PLEASE_REPLACE_WITH_AT_LEAST_32_CHARS";
}

const sessionOptions: SessionOptions = {
  // Resolved lazily per request so `next build` on Vercel doesn't crash
  // when env vars aren't present at build time. iron-session reads
  // `password` at getIronSession() call time.
  get password() {
    return resolveSessionSecret();
  },
  cookieName: "ecf_roster_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const c = cookies();
  return getIronSession<SessionData>(c, sessionOptions);
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const s = await getSession();
  if (!s.userId) return null;
  const col = await collections.users();
  const oid = toObjectId(s.userId);
  const u = oid ? (await col.findOne({ _id: oid })) : null;
  if (!u) return null;
  return stripPassword(u);
}

export function stripPassword(u: User): SafeUser {
  const { passwordHash, ...rest } = u;
  return rest as SafeUser & { _id: string };
}

export function requireRole(user: SafeUser | null, ...roles: Role[]): SafeUser {
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
