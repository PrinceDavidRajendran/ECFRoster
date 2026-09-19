import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

// POST { currentPassword, newPassword } — logged-in users change their own password.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current one." },
      { status: 400 }
    );
  }
  const col = await collections.users();
  const user = await col.findOne({ email: me.email });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  await col.updateOne(
    { email: me.email },
    { $set: { passwordHash: await hashPassword(newPassword) } }
  );
  return NextResponse.json({ ok: true });
}
