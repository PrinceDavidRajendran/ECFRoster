import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import type { User } from "@/lib/types";

// Must reflect the live user count — never serve a cached answer.
export const dynamic = "force-dynamic";

// Returns whether the system has any admin yet (drives the first-run UI).
export async function GET() {
  const col = await collections.users();
  const count = await col.countDocuments();
  return NextResponse.json({ needsSetup: count === 0 });
}

// Creates the first admin. Only works when no users exist yet.
export async function POST(req: NextRequest) {
  const col = await collections.users();
  const count = await col.countDocuments();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup already complete. Ask an admin to log in." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!name || !email || password.length < 8) {
    return NextResponse.json(
      { error: "Name, email and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }
  const existing = await col.findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const doc: Omit<User, "_id"> = {
    email,
    passwordHash,
    name,
    role: "admin",
    createdAt: now,
  };
  const insert = await col.insertOne(doc);
  const s = await getSession();
  s.userId = String(insert.insertedId);
  s.email = email;
  s.name = name;
  s.role = "admin";
  await s.save();
  return NextResponse.json({ ok: true });
}
