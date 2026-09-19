import { NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { loadTelegramConfig } from "@/lib/telegram";

// Auth-gated live data — never serve a cached answer.
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  // Only report whether Telegram is configured, never expose the actual tokens.
  const cfg = loadTelegramConfig();
  return NextResponse.json({
    configured: !!cfg,
  });
}
