import { NextRequest, NextResponse } from "next/server";
import { collections, toObjectId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildLookup } from "@/lib/rules";
import { validateRoster, applyAbsences } from "@/lib/rules";
import { sendTelegramMessage, sendTelegramDocument } from "@/lib/telegram";
import { DEFAULT_RULES } from "@/lib/defaultRules";
import type { Person, Role, Roster, RosterStatus, Rules } from "@/lib/types";

// pdfkit needs the Node.js runtime (not edge).
export const runtime = "nodejs";

// Auth-gated live data — never serve a cached answer.
export const dynamic = "force-dynamic";

// Escapes text for safe inclusion in Telegram HTML messages.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadRoster(id: string) {
  const col = await collections.rosters();
  const oid = toObjectId(id);
  if (!oid) return { col, roster: null };
  return { col, roster: (await col.findOne({ _id: oid })) };
}

async function loadRules(): Promise<Rules> {
  const col = await collections.rules();
  const doc = (await col.findOne({})) as Rules | null;
  return { ...DEFAULT_RULES, ...(doc || {}) };
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { roster } = await loadRoster(ctx.params.id);
  if (!roster) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ roster });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { col, roster } = await loadRoster(ctx.params.id);
  if (!roster) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  // Role-gate workflow actions. Each transition is restricted to the roles
  // allowed to perform it (admin can do everything).
  if (body.action) {
    const allowed = actionRoles[body.action as string];
    if (!allowed) {
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
    if (!allowed.includes(me.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } else {
    // Direct cell edits: only worship coordinators and admins.
    if (me.role !== "admin" && me.role !== "worship") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  // APPROVED rosters are read-only EXCEPT an admin resetting back to DRAFT
  // (so conflicts raised by the team can be fixed).
  if (roster.status === "APPROVED") {
    const isAdminReset = me.role === "admin" && body.action === "reset";
    if (!isAdminReset) {
      return NextResponse.json({ error: "Roster is APPROVED and read-only." }, { status: 409 });
    }
  }
  const now = new Date();
  const audit = roster.auditLog || [];

  // Status transitions are handled explicitly by the dedicated endpoint below,
  // but we accept "status" here too as a convenience.
  if (body.saturdays !== undefined) roster.saturdays = body.saturdays;
  if (body.sundays !== undefined) roster.sundays = body.sundays;
  if (body.absences !== undefined) {
    roster.absences = sanitizeAbsences(body.absences);
    // Forward-propagate month-spanning absences into the next month's roster
    // (if it already exists) so "away next month too" is automatic. Stale
    // carries from this month are removed first, so shortening/removing an
    // absence cleans up next month as well.
    try {
      await propagateAbsencesForward(col, roster.month, roster.absences);
    } catch (e) {
      console.warn("[roster] forward-propagate absences failed:", e);
    }
  }

  if (body.action) {
    // Derive a base URL for Telegram links: env override first, else the
    // request origin (so links always work even without NEXT_PUBLIC_BASE_URL).
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "").replace(/\/$/, "");
    const res = await applyAction(body.action, roster, me.email, body.detail, baseUrl);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    audit.push({
      at: now.toISOString(),
      by: me.email,
      action: body.action,
      detail: body.detail,
    });
    roster.warnings = res.warnings || [];
    roster.auditLog = audit;
    roster.updatedAt = now;
    const oid = toObjectId(String(roster._id));
    if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await col.updateOne(
      { _id: oid },
      { $set: { saturdays: roster.saturdays, sundays: roster.sundays, status: roster.status,
                warnings: roster.warnings, auditLog: roster.auditLog, absences: roster.absences || [],
                updatedAt: now } }
    );
    return NextResponse.json({ roster, telegram: res.telegram || { ok: true } });
  } else {
    // Re-validate on any save (e.g. manual cell edits). Fold this month's
    // absences in so rostering an absent person raises a hard warning.
    const peopleCol = await collections.people();
    const people = (await peopleCol.find({}).toArray()) as Person[];
    const rules = await loadRules();
    const availablePeople = applyAbsences(people, roster.absences);
    roster.warnings = validateRoster(roster, buildLookup(availablePeople), rules);
  }

  roster.auditLog = audit;
  roster.updatedAt = now;
  const oid = toObjectId(String(roster._id));
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await col.updateOne(
    { _id: oid },
    { $set: { saturdays: roster.saturdays, sundays: roster.sundays, status: roster.status,
              warnings: roster.warnings, auditLog: roster.auditLog, absences: roster.absences || [],
              updatedAt: now } }
  );
  return NextResponse.json({ roster });
}

// DELETE (admin only).
export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { col } = await loadRoster(ctx.params.id);
  const oid = toObjectId(ctx.params.id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await col.deleteOne({ _id: oid });
  return NextResponse.json({ ok: true });
}

// Which roles may perform each workflow action (admin may do all).
const actionRoles: Record<string, Role[]> = {
  worship_submit: ["worship", "admin"],
  worship_reject: ["admin"],
  service_submit: ["admin"],
  service_reject: ["admin"],
  approve: ["admin"],
  reset: ["admin"],
};

// Drop empty/invalid absence rows from client saves.
function sanitizeAbsences(input: unknown): Roster["absences"] {
  if (!Array.isArray(input)) return [];
  const out: NonNullable<Roster["absences"]> = [];
  for (const a of input as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    const personName = String((a.personName ?? "") as string).trim();
    const from = String((a.from ?? "") as string).trim();
    if (!personName || !/^\d{4}-\d{2}-\d{2}$/.test(from)) continue;
    const rawTo = typeof a.to === "string" ? a.to.trim() : "";
    const to = rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) && rawTo >= from ? rawTo : undefined;
    const rawNote = typeof a.note === "string" ? a.note.trim() : "";
    const rawCarried = typeof a.carriedFrom === "string" ? a.carriedFrom.trim() : "";
    out.push({
      personName,
      from,
      ...(to ? { to } : {}),
      ...(rawNote ? { note: rawNote } : {}),
      ...(/^\d{4}-\d{2}$/.test(rawCarried) ? { carriedFrom: rawCarried } : {}),
    });
  }
  return out;
}

function nextMonthStr(month: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  let year = Number(m[1]);
  let mon = Number(m[2]) + 1;
  if (mon > 12) { mon = 1; year += 1; }
  return `${year}-${String(mon).padStart(2, "0")}`;
}

// Carry month-spanning absences forward through every existing future roster.
// Chain: after updating month N+1 (removing stale carries from N, adding fresh
// ones), that month's full absence list becomes the source for N+2, so a Sep→Nov
// range reaches Nov even if Oct already exists. Each updated roster is
// re-validated so pre-populated assignments covered by a new absence immediately
// surface hard warnings.
async function propagateAbsencesForward(
  col: Awaited<ReturnType<typeof collections.rosters>>,
  fromMonth: string,
  fromAbsences: Roster["absences"]
): Promise<void> {
  let sourceMonth: string | null = fromMonth;
  let sourceAbsences: Roster["absences"] = fromAbsences;
  // Guard against pathological loops; 24 hops is well beyond any real range.
  for (let hop = 0; hop < 24; hop++) {
    if (!sourceMonth) break;
    const nextMonth = nextMonthStr(sourceMonth);
    if (!nextMonth) break;
    const firstDay = `${nextMonth}-01`;
    const spill = (sourceAbsences || []).filter(
      (a) => (a.to || a.from) >= firstDay
    );
    const nextDoc = (await col.findOne({ month: nextMonth })) as Roster | null;
    if (!nextDoc) break; // not created yet — creation carry-forward will handle it
    const current: NonNullable<Roster["absences"]> = Array.isArray(nextDoc.absences)
      ? [...nextDoc.absences]
      : [];
    // Remove stale auto-carries that came from the source month.
    const kept = current.filter(
      (a) => (a as { carriedFrom?: string }).carriedFrom !== sourceMonth
    );
    // Fresh carries (clamped to the next month's first day), skipping exact
    // duplicates of a manually-entered row.
    const fresh: NonNullable<Roster["absences"]> = [];
    for (const a of spill) {
      const entry = {
        personName: a.personName,
        from: a.from < firstDay ? firstDay : a.from,
        ...(a.to ? { to: a.to } : {}),
        ...(a.note ? { note: a.note } : {}),
        carriedFrom: sourceMonth,
      };
      const dup = kept.some(
        (k) =>
          k.personName.trim().toLowerCase() === entry.personName.trim().toLowerCase() &&
          k.from === entry.from &&
          (k.to || "") === (entry.to || "")
      );
      if (!dup) fresh.push(entry);
    }
    const merged = [...kept, ...fresh].sort(
      (x, y) => x.from.localeCompare(y.from) || x.personName.localeCompare(y.personName)
    );
    const changed = JSON.stringify(merged) !== JSON.stringify(current);
    if (changed) {
      // Re-validate the next roster so new carries flag hard errors on
      // already-rostered people.
      const peopleCol = await collections.people();
      const people = (await peopleCol.find({}).toArray()) as Person[];
      const rules = await loadRules();
      const availablePeople = applyAbsences(people, merged);
      const warnings = validateRoster(
        { ...nextDoc, absences: merged },
        buildLookup(availablePeople),
        rules
      );
      await col.updateOne(
        { _id: nextDoc._id },
        {
          $set: {
            absences: merged,
            warnings,
            updatedAt: new Date(),
          },
        }
      );
    }
    // Continue the chain with the next month's (possibly updated) list.
    sourceMonth = nextMonth;
    sourceAbsences = changed ? merged : current;
    // Stop early if nothing spills further.
    const further = (sourceAbsences || []).some(
      (a) => (a.to || a.from) >= `${nextMonthStr(nextMonth) || "9999-99"}-01`
    );
    if (!further) break;
  }
}

// Apply status workflow action with side effects (Telegram, validation).
async function applyAction(
  action: string,
  roster: Roster,
  byEmail: string,
  detail?: string,
  baseUrl = ""
): Promise<{ error?: string; warnings?: Roster["warnings"]; telegram?: { ok: boolean; error?: string } }> {
  const VALID: RosterStatus[] = ["DRAFT", "WORSHIP_FILLED", "SERVICE_FILLED", "APPROVED"];
  const transitions: Record<string, RosterStatus> = {
    worship_submit: "WORSHIP_FILLED",
    worship_reject: "DRAFT",
    service_submit: "SERVICE_FILLED",
    service_reject: "WORSHIP_FILLED",
    approve: "APPROVED",
    reset: "DRAFT",
  };
  const next = transitions[action];
  if (!next) return { error: `Unknown action: ${action}` };
  if (!VALID.includes(next)) return { error: "Invalid next status" };

  // On any submit/approve, recompute warnings.
  const peopleCol = await collections.people();
  const people = (await peopleCol.find({}).toArray()) as Person[];
  const rules = await loadRules();
  const warnings = validateRoster(roster, buildLookup(applyAbsences(people, roster.absences)), rules);

  roster.status = next;

  // Telegram handoffs. The link always points to the login-protected roster
  // view; unauthenticated users are redirected to /login?next=... first.
  const cleanBase = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const link = cleanBase ? `${cleanBase}/service?month=${roster.month}` : "";
  const linkTag = link ? `<a href="${link}">${link}</a>` : "";
  // Escape user-controlled values before embedding in HTML Telegram messages.
  const safeEmail = escapeHtml(byEmail);
  const safeMonth = escapeHtml(roster.month);
  const safeDetail = escapeHtml(detail || "(none)");
  // Telegram delivery tracking. Sends used to fail silently (submit
  // succeeded, nobody notified). Failures are logged server-side (visible in
  // Vercel Function Logs) and summarized back to the caller for UI display.
  const deliveries: { ok: boolean; error?: string }[] = [];
  async function notify(p: Promise<{ ok: boolean; error?: string }>) {
    const r = await p;
    deliveries.push(r);
    if (!r.ok) {
      console.warn(`[telegram] ${action} for ${roster.month} NOT delivered: ${r.error}`);
    }
  }

  if (action === "worship_submit") {
    const msg = `🎶 Worship portion submitted for <b>${safeMonth}</b> by ${safeEmail}.\nPlease review and fill the rest: ${linkTag}`;
    await notify(sendTelegramMessage(msg));
  } else if (action === "service_submit") {
    const msg =
      `✅ <b>${safeMonth}</b> roster is ready for approval (submitted by ${safeEmail}).\n` +
      `👉 Tap here to view and approve: ${linkTag}`;
    await notify(sendTelegramMessage(msg));
  } else if (action === "approve") {
    // Send the approval message with the roster PDF attached (no link needed).
    const caption = `✝️ <b>${safeMonth}</b> roster is APPROVED and final.`;
    try {
      const { generateRosterPdf } = await import("@/lib/pdf");
      const rulesDoc = await loadRules();
      const pdf = await generateRosterPdf(roster, rulesDoc);
      const fileName = `ECF-Service-Roster-${roster.month}.pdf`;
      const sent = await sendTelegramDocument(pdf, fileName, caption);
      if (!sent.ok) {
        // Fall back to a plain message if the document failed to send.
        await notify(sendTelegramMessage(caption));
      } else {
        deliveries.push({ ok: true });
      }
    } catch {
      await notify(sendTelegramMessage(caption));
    }
  } else if (action === "worship_reject" || action === "service_reject") {
    const who = action === "worship_reject" ? "worship" : "service";
    await notify(
      sendTelegramMessage(`↩️ ${who} portion sent back for ${safeMonth}. Reason: ${safeDetail}`)
    );
  }
  const failed = deliveries.find((d) => !d.ok);
  return {
    warnings,
    telegram: failed ? { ok: false, error: failed.error } : { ok: true },
  };
}
