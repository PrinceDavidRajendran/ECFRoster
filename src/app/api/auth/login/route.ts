import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getSession, verifyPassword, stripPassword } from "@/lib/auth";
import type { User } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const col = await collections.users();
  const user = (await col.findOne({ email })) as User | null;
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const s = await getSession();
  const safe = stripPassword(user);
  s.userId = String(user._id);
  s.email = user.email;
  s.name = user.name;
  s.role = user.role;
  await s.save();
  return NextResponse.json({ user: safe });
}
