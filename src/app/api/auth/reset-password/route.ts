import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { consumeResetToken, verifyResetToken } from "@/lib/passwordReset";

// GET ?token=… — validate without consuming (drives the reset page UI).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const email = await verifyResetToken(token);
  if (!email) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
  return NextResponse.json({ valid: true });
}

// POST { token, password } — set a new password (single-use token).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  const email = await consumeResetToken(token);
  if (!email) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Ask an admin for a new one." },
      { status: 400 }
    );
  }
  const col = await collections.users();
  const user = await col.findOne({ email });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  await col.updateOne({ email }, { $set: { passwordHash: await hashPassword(password) } });
  return NextResponse.json({ ok: true });
}
