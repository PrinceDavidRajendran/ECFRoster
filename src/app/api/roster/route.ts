import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { MonthAbsence, Roster } from "@/lib/types";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const col = await collections.rosters();
  const rosters = (await col.find({}).sort({ month: -1 }).toArray()) as Roster[];
  // Light list payload.
  return NextResponse.json({
    rosters: rosters.map((r) => ({
      _id: String(r._id),
      month: r.month,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const month = String(body.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const col = await collections.rosters();
  const existing = await col.findOne({ month });
  if (existing) {
    return NextResponse.json({ error: "Roster for that month already exists" }, { status: 409 });
  }

  // Carry forward absences from the previous month whose range spills into this
  // month (e.g. away the last week of last month through the first weeks of this
  // one). Clamp their start to this month's first day for a tidy display.
  const firstDay = `${month}-01`;
  const prevMonth = previousMonthStr(month);
  const prev = prevMonth ? await col.findOne({ month: prevMonth }) : null;
  const carried: MonthAbsence[] = (prev?.absences || [])
    .filter((a) => (a.to || a.from) >= firstDay)
    .map((a) => ({
      personName: a.personName,
      from: a.from < firstDay ? firstDay : a.from,
      to: a.to,
      note: a.note,
    }));

  const now = new Date();
  const doc: Omit<Roster, "_id"> = {
    month,
    status: "DRAFT",
    saturdays: [],
    sundays: [],
    warnings: [],
    absences: carried,
    auditLog: [
      { at: now.toISOString(), by: me.email, action: "create", detail: `Created ${month}` },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const ins = await col.insertOne(doc);
  return NextResponse.json({ _id: String(ins.insertedId), month });
}

// Returns the previous month string ("YYYY-MM") for a given "YYYY-MM".
function previousMonthStr(month: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  let year = Number(m[1]);
  let mon = Number(m[2]) - 1;
  if (mon < 1) {
    mon = 12;
    year -= 1;
  }
  return `${year}-${String(mon).padStart(2, "0")}`;
}
