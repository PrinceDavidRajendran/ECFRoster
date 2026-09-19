import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Deployment diagnostic — reports booleans only, never secret values.
// Visit https://<your-app>.vercel.app/api/health after deploying:
//   { ok: true, db: "up", sessionSecret: "configured", users: <count> }
// If sessionSecret is "missing-or-too-short", set SESSION_SECRET (≥32 chars)
// in Vercel → Project → Settings → Environment Variables and redeploy.
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionSecret = process.env.SESSION_SECRET || "";
  const report: Record<string, unknown> = {
    sessionSecret:
      sessionSecret.length >= 32 ? "configured" : "missing-or-too-short",
    mongodbUri: process.env.MONGODB_URI ? "configured" : "missing",
    db: "unknown" as string,
    users: null as number | null,
  };
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    report.db = "up";
    report.users = await db.collection("users").countDocuments();
    // Collection counts only (no personal data) — verifies seed/clone state.
    report.people = await db.collection("people").countDocuments();
    report.rules = await db.collection("rules").countDocuments();
    report.rosters = await db.collection("rosters").countDocuments();
    report.rosterMonths = (
      await db.collection("rosters").find({}).project({ month: 1 }).toArray()
    ).map((r) => (r as { month?: string }).month);
  } catch (e) {
    report.db = `error: ${String((e as Error).message).slice(0, 200)}`;
  }
  const ok = report.db === "up" && report.sessionSecret === "configured";
  return NextResponse.json({ ok, ...report }, { status: ok ? 200 : 500 });
}
