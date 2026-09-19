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
  if (body.absences !== undefined) roster.absences = body.absences;

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

// Apply status workflow action with side effects (Telegram, validation).
async function applyAction(
  action: string,
  roster: Roster,
  byEmail: string,
  detail?: string,
  baseUrl = ""
): Promise<{ error?: string; warnings?: Roster["warnings"] }> {
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
  if (action === "worship_submit") {
    const msg = `🎶 Worship portion submitted for <b>${safeMonth}</b> by ${safeEmail}.\nPlease review and fill the rest: ${linkTag}`;
    await sendTelegramMessage(msg);
  } else if (action === "service_submit") {
    const msg =
      `✅ <b>${safeMonth}</b> roster is ready for approval (submitted by ${safeEmail}).\n` +
      `👉 Tap here to view and approve: ${linkTag}`;
    await sendTelegramMessage(msg);
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
        await sendTelegramMessage(caption);
      }
    } catch {
      await sendTelegramMessage(caption);
    }
  } else if (action === "worship_reject" || action === "service_reject") {
    const who = action === "worship_reject" ? "worship" : "service";
    await sendTelegramMessage(`↩️ ${who} portion sent back for ${safeMonth}. Reason: ${safeDetail}`);
  }
  return { warnings };
}
