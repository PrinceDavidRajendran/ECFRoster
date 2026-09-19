import { NextRequest, NextResponse } from "next/server";
import { collections, toObjectId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_RULES } from "@/lib/defaultRules";
import { generateRoster } from "@/lib/algorithm";
import { validateRoster, buildLookup, applyAbsences, isUnavailable, normalize } from "@/lib/rules";
import type { MonthAbsence, Person, Roster, Rules } from "@/lib/types";

// POST /api/generate
// Body: { month: "YYYY-MM", worshipOnly?: boolean, rosterId?: string }
// If rosterId is provided, we update that roster; otherwise we just return a
// preview (caller decides whether to persist via PATCH).
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const month = String(body.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  // Worship-only generation only allowed for worship coord (and admin).
  const worshipOnly = !!body.worshipOnly;
  if (worshipOnly && me.role !== "worship" && me.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!worshipOnly && me.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const rulesCol = await collections.rules();
  const rulesDoc = (await rulesCol.findOne({})) as Rules | null;
  const rules: Rules = { ...DEFAULT_RULES, ...(rulesDoc || {}) };

  const peopleCol = await collections.people();
  const people = (await peopleCol.find({}).toArray()) as Person[];

  // Load the previous month's roster (if any) for cross-month fairness so
  // people not rostered last month are prioritised and combinations vary.
  const rosterCol = await collections.rosters();
  const prevMonth = previousMonthStr(month);
  const previousRoster = prevMonth
    ? ((await rosterCol.findOne({ month: prevMonth })) as Roster | null) || undefined
    : undefined;

  // Absences for this month: prefer the (possibly unsaved) list from the caller,
  // otherwise fall back to whatever is stored on the target roster. Merging them
  // into people means every availability check blocks absent people automatically.
  let absences: MonthAbsence[] = Array.isArray(body.absences) ? body.absences : [];
  if (!absences.length && body.rosterId) {
    const oid = toObjectId(String(body.rosterId));
    const target = oid ? await rosterCol.findOne({ _id: oid }) : null;
    if (target?.absences?.length) absences = target.absences;
  }
  const availablePeople = applyAbsences(people, absences);

  const { roster, unresolved } = generateRoster(month, rules, availablePeople, {
    worshipOnly,
    previousRoster,
  });

  // Run validators to populate warnings.
  const warnings = validateRoster(roster, buildLookup(availablePeople), rules);
  roster.warnings = warnings;

  // If merging with an existing roster (service-coord fills on top of worship),
  // preserve the worship-team slots from the existing doc.
  if (body.rosterId) {
    const col = await collections.rosters();
    const oid = toObjectId(String(body.rosterId));
    if (!oid) return NextResponse.json({ error: "Invalid rosterId" }, { status: 400 });
    const existing = (await col.findOne({ _id: oid }));
    if (existing) {
      // Merge existing choices on top of the fresh fill, but drop anyone now
      // marked away so their slot is repopulated instead of kept as-is.
      const lookup = buildLookup(availablePeople);
      const isAway = (name: string, date: string, isSat: boolean) =>
        isUnavailable(name, date, isSat, rules, lookup);
      roster.sundays = mergeWeeks(existing.sundays, roster.sundays, worshipOnly, isAway);
      roster.saturdays = mergeWeeks(existing.saturdays, roster.saturdays, worshipOnly, isAway);
      roster.status = existing.status;
      roster.auditLog = existing.auditLog || [];
      roster.createdAt = existing.createdAt;
      const now = new Date();
      roster.auditLog.push({
        at: now.toISOString(),
        by: me.email,
        action: "generate",
        detail: worshipOnly ? "Auto-filled worship portion" : "Auto-filled all slots",
      });
      roster.updatedAt = now;
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            saturdays: roster.saturdays,
            sundays: roster.sundays,
            warnings: roster.warnings,
            auditLog: roster.auditLog,
            updatedAt: now,
          },
        }
      );
      return NextResponse.json({ roster: stripIds(roster), unresolved });
    }
  }

  return NextResponse.json({ roster: stripIds(roster), unresolved });
}

function mergeWeeks(
  existing: Roster["sundays"],
  generated: Roster["sundays"],
  worshipOnly: boolean,
  isAway: (name: string, date: string, isSat: boolean) => boolean
): Roster["sundays"] {
  if (!existing || existing.length === 0) return generated;
  return generated.map((gw) => {
    const ew = existing.find((e) => e.date === gw.date);
    if (!ew) return gw;
    const isSat = gw.day === "saturday";
    // Merge slot by slot. Keep the existing choice, minus anyone now away; if a
    // slot empties out, fall back to the fresh generation (which excludes away).
    const merged = { ...gw };
    const keys = Object.keys(gw) as (keyof typeof gw)[];
    for (const k of keys) {
      if (k === "date" || k === "day") continue;
      const ev = ew[k];
      const gv = gw[k];
      let evClean: string | string[] | undefined = ev as string | string[] | undefined;
      if (typeof ev === "string") {
        evClean = ev.trim() && isAway(ev, gw.date, isSat) ? "" : ev;
      } else if (Array.isArray(ev)) {
        const cleaned = ev.filter((n) => !isAway(n, gw.date, isSat));
        // Backfill any removed (away) people from the fresh generation so slot
        // counts (e.g. singers) stay intact.
        if (Array.isArray(gv) && cleaned.length < ev.length) {
          for (const n of gv) {
            if (cleaned.length >= ev.length) break;
            const dup = cleaned.some((x) => normalize(x) === normalize(n));
            if (!dup && !isAway(n, gw.date, isSat)) cleaned.push(n);
          }
        }
        evClean = cleaned;
      }
      const hasExisting =
        (typeof evClean === "string" && evClean.trim()) ||
        (Array.isArray(evClean) && evClean.length > 0);
      if (hasExisting) {
        (merged as Record<string, unknown>)[k as string] = evClean;
      } else if (worshipOnly) {
        // In worship-only mode, don't write into service-owned slots.
        if (!WORSHIP_SLOTS.has(k as string)) {
          (merged as Record<string, unknown>)[k as string] = Array.isArray(gv) ? [] : "";
        }
      }
      // else: keep gv (fresh generation, already excludes away people).
    }
    return merged as Roster["sundays"][number];
  });
}

const WORSHIP_SLOTS = new Set([
  "worshipLeader",
  "singers",
  "piano",
  "guitar",
  "bass",
  "drums",
  "freeshow",
]);

// Strip MongoDB _id values from inside weeks (they shouldn't be there anyway).
function stripIds(r: Roster): Roster {
  return r;
}

// Returns the previous month string ("YYYY-MM") for a given "YYYY-MM".
function previousMonthStr(month: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  let year = Number(m[1]);
  let mon = Number(m[2]) - 1; // previous month
  if (mon < 1) {
    mon = 12;
    year -= 1;
  }
  return `${year}-${String(mon).padStart(2, "0")}`;
}
