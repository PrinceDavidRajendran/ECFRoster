import { NextRequest, NextResponse } from "next/server";
import { collections, toObjectId } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import type { CapabilityKey, Person } from "@/lib/types";

// Auth-gated live data — never serve a cached answer.
export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return { error: NextResponse.json({ error: String((e as Error).message) }, { status: 403 }) };
  }
  return { me: me! };
}

export async function GET() {
  // All logged-in users can read people.
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const col = await collections.people();
  const people = (await col.find({}).sort({ name: 1 }).toArray()) as Person[];
  return NextResponse.json({ people });
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin();
  if ("error" in guard) return guard.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const person: Omit<Person, "_id"> = {
    name,
    active: body.active !== false,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
    awayDates: Array.isArray(body.awayDates) ? body.awayDates : [],
    notes: body.notes ? String(body.notes) : undefined,
  };
  const col = await collections.people();
  const exists = await col.findOne({ name });
  if (exists) return NextResponse.json({ error: "Name already exists" }, { status: 409 });
  await col.insertOne(person);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const guard = await ensureAdmin();
  if ("error" in guard) return guard.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body._id || "");
  if (!id) return NextResponse.json({ error: "_id required" }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.active === "boolean") update.active = body.active;
  if (Array.isArray(body.capabilities)) {
    update.capabilities = body.capabilities as CapabilityKey[];
  }
  if (Array.isArray(body.awayDates)) update.awayDates = body.awayDates;
  if (typeof body.notes === "string") update.notes = body.notes;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const col = await collections.people();
  await col.updateOne({ _id: oid }, { $set: update });
  // If away dates changed, re-validate every roster whose month overlaps any
  // away range so pre-populated (including next month's) assignments covered
  // by the new dates immediately surface hard validation errors. This is
  // warnings-only — assignments are never auto-changed here.
  if (Array.isArray(body.awayDates)) {
    try {
      await revalidateRostersForAwayDates();
    } catch (e) {
      console.warn("[people] roster revalidation failed:", e);
    }
  }
  return NextResponse.json({ ok: true });
}

async function revalidateRostersForAwayDates(): Promise<void> {
  const { buildLookup, validateRoster, applyAbsences } = await import("@/lib/rules");
  const { DEFAULT_RULES } = await import("@/lib/defaultRules");
  const peopleCol = await collections.people();
  const people = (await peopleCol.find({}).toArray()) as Person[];
  const rulesCol = await collections.rules();
  const rulesDoc = await rulesCol.findOne({});
  const rules = { ...DEFAULT_RULES, ...(rulesDoc || {}) };
  const rosterCol = await collections.rosters();
  const rosters = (await rosterCol.find({}).toArray()) as import("@/lib/types").Roster[];
  for (const r of rosters) {
    const available = applyAbsences(people, r.absences);
    const warnings = validateRoster(r, buildLookup(available), rules);
    const before = JSON.stringify(r.warnings || []);
    if (JSON.stringify(warnings) !== before) {
      await rosterCol.updateOne(
        { _id: r._id },
        { $set: { warnings, updatedAt: new Date() } }
      );
    }
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await ensureAdmin();
  if ("error" in guard) return guard.error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const col = await collections.people();
  await col.deleteOne({ _id: oid });
  return NextResponse.json({ ok: true });
}
