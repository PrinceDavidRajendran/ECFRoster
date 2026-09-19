import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  appBaseUrl,
  createResetToken,
  resetLinkFor,
} from "@/lib/passwordReset";

// POST { email } — always returns { ok: true } to avoid user enumeration.
// If the caller is a logged-in admin, the one-time reset link is returned
// so the admin can share it with the user (WhatsApp/Telegram/email).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    // Still generic — don't reveal anything.
    return NextResponse.json({ ok: true });
  }
  const col = await collections.users();
  const user = await col.findOne({ email });
  const me = await getCurrentUser().catch(() => null);
  const isAdmin = !!me && me.role === "admin";

  if (!user) {
    return NextResponse.json({ ok: true });
  }
  const raw = await createResetToken(email);
  const link = resetLinkFor(appBaseUrl(req.url), raw);

  // Server log helps local dev / Vercel logs without leaking to the public.
  console.log(`[password-reset] token issued for ${email}`);

  if (isAdmin) {
    return NextResponse.json({ ok: true, resetLink: link });
  }
  // Public caller: do NOT reveal the link. The user must ask an admin,
  // who generates a link from Admin → Users → "Reset link".
  return NextResponse.json({ ok: true });
}
