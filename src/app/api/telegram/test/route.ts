import { NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const res = await sendTelegramMessage(
    "✅ ECF Roster: Telegram connection test successful."
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Telegram error" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
