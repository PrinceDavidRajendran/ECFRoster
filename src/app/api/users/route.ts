import { NextRequest, NextResponse } from "next/server";
import { collections, toObjectId } from "@/lib/db";
import { getCurrentUser, hashPassword, requireRole, stripPassword } from "@/lib/auth";
import type { Role, User } from "@/lib/types";

// Auth-gated live data — never serve a cached answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const col = await collections.users();
  const users = (await col.find({}).sort({ createdAt: 1 }).toArray()) as User[];
  return NextResponse.json({ users: users.map(stripPassword) });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = body.role as Role;
  if (!["admin", "worship"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!name || !email || password.length < 8) {
    return NextResponse.json(
      { error: "Name, email and a password (>= 8 chars) are required." },
      { status: 400 }
    );
  }
  const col = await collections.users();
  const existing = await col.findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }
  const doc: Omit<User, "_id"> = {
    email,
    passwordHash: await hashPassword(password),
    name,
    role,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body._id || "");
  if (!id) return NextResponse.json({ error: "_id required" }, { status: 400 });
  const col = await collections.users();
  const update: Record<string, unknown> = {};
  if (body.name) update.name = String(body.name).trim();
  if (body.email) update.email = String(body.email).trim().toLowerCase();
  if (body.role && ["admin", "worship"].includes(body.role)) {
    update.role = body.role as Role;
  }
  if (typeof body.password === "string" && body.password.length >= 8) {
    update.passwordHash = await hashPassword(body.password);
  } else if (typeof body.password === "string" && body.password.length > 0) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await col.updateOne({ _id: oid }, { $set: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (me!._id && String(me!._id) === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const col = await collections.users();
  await col.deleteOne({ _id: oid });
  return NextResponse.json({ ok: true });
}
