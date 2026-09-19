import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { DEFAULT_RULES } from "@/lib/defaultRules";
import type { Rules } from "@/lib/types";

// Returns a shallow copy of the doc without its Mongo _id field.
function stripId<T extends { _id?: unknown }>(doc: T): Omit<T, "_id"> {
  const rest = { ...doc } as Record<string, unknown>;
  delete rest._id;
  return rest as Omit<T, "_id">;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const col = await collections.rules();
  let doc = (await col.findOne({})) as Rules | null;
  if (!doc) {
    await col.insertOne({ ...DEFAULT_RULES });
    doc = (await col.findOne({})) as Rules | null;
  }
  return NextResponse.json({ rules: doc });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  try {
    requireRole(me, "admin");
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const col = await collections.rules();
  const existing = await col.findOne({});
  const next: Omit<Rules, "_id"> = { ...DEFAULT_RULES, ...stripId(existing || {}), ...body };
  if (existing?._id) {
    await col.updateOne({ _id: existing._id }, { $set: next });
  } else {
    await col.insertOne(next);
  }
  return NextResponse.json({ ok: true });
}
