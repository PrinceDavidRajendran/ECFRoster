"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/dates";
import type { MonthAbsence, Roster, RosterStatus, Rules, WeekAssignments } from "@/lib/types";
import RosterGrid from "@/components/RosterGrid";
import RosterPrintView from "@/components/RosterPrintView";
import AbsencePanel from "@/components/AbsencePanel";

// Slots the service coordinator owns (everything EXCEPT worship team).
const SERVICE_SLOTS: (keyof WeekAssignments)[] = [
  "preaching",
  "sound",
  "camera",
  "hcConductor",
  "hcServers",
  "hcSetup",
  "ushers",
  "counting",
  "toiletM",
  "toiletF",
  "hospitalityTeam",
  "hospitality",
  "hospitalityLeads",
  "kitchen",
  "cafe",
];

// Worship-coord-owned slots (read-only here but visible).
const WORSHIP_SLOTS: (keyof WeekAssignments)[] = [
  "worshipLeader",
  "singers",
  "piano",
  "guitar",
  "bass",
  "drums",
  "freeshow",
  "strings",
];

interface Light {
  _id: string;
  month: string;
  status: RosterStatus;
}

export default function ServiceRosterPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const sp = useSearchParams();
  const [month, setMonth] = useState(sp.get("month") || "");
  const [rosters, setRosters] = useState<Light[]>([]);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [rules, setRules] = useState<Rules | null>(null);
  const [newMonth, setNewMonth] = useState(nextMonth());

  const loadList = useCallback(async () => {
    const res = await fetch("/api/roster");
    if (res.ok) {
      const d = await res.json();
      setRosters(d.rosters || []);
    }
  }, []);

  async function createMonth() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: newMonth }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Failed to create month");
      return;
    }
    await loadList();
    setMonth(newMonth);
  }

  const loadRoster = useCallback(
    async (m: string) => {
      setRoster(null);
      setError(null);
      const item = rosters.find((r) => r.month === m);
      if (!item) {
        setError("Roster not found for " + m);
        return;
      }
      const res = await fetch(`/api/roster/${item._id}`);
      if (res.ok) {
        const d = await res.json();
        setRoster(d.roster);
        setMonth(m);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to load roster");
      }
    },
    [rosters]
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    // Load rules once (for PDF footer text).
    fetch("/api/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.rules) setRules(d.rules); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (month && rosters.length) loadRoster(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, rosters.length]);

  // Admin can edit at DRAFT and WORSHIP_FILLED. Service coord cannot edit
  // until worship has submitted (WORSHIP_FILLED), and editing locks at
  // SERVICE_FILLED / APPROVED.
  function canEdit(roster: Roster): boolean {
    return (
      roster.status === "DRAFT" || roster.status === "WORSHIP_FILLED"
    );
  }

  async function generateAll() {
    if (!roster) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: roster.month,
        rosterId: roster._id,
        absences: roster.absences || [],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Generate failed");
      return;
    }
    const d = await res.json();
    // Use the returned roster directly to avoid stale-state re-fetch issues.
    if (d.roster) {
      setRoster({ ...d.roster, _id: roster._id });
    }
    setNote("Auto-filled all slots.");
    setTimeout(() => setNote(null), 3000);
  }

  async function saveWeek(week: WeekAssignments) {
    if (!roster) return;
    setBusy(true);
    const saturdays = roster.saturdays.map((w) =>
      w.date === week.date ? week : w
    );
    const sundays = roster.sundays.map((w) => (w.date === week.date ? week : w));
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saturdays, sundays }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
    } else {
      const d = await res.json();
      setError(d.error || "Save failed");
    }
  }

  async function saveAbsences(absences: MonthAbsence[]) {
    if (!roster) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absences }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
    } else {
      const d = await res.json();
      setError(d.error || "Save failed");
    }
  }

  async function submitForApproval() {
    if (!roster) return;
    if (
      !confirm(
        "Submit to Admin for approval? The roster will be locked until approved or sent back."
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "service_submit" }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
    } else {
      const d = await res.json();
      setError(d.error || "Submit failed");
    }
  }

  async function rejectToWorship() {
    if (!roster) return;
    if (!rejectReason.trim()) {
      setError("Please enter a reason before sending back to Worship.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "worship_reject",
        detail: rejectReason.trim(),
      }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
      setRejectReason("");
    } else {
      const d = await res.json();
      setError(d.error || "Reject failed");
    }
  }

  async function approve() {
    if (!roster) return;
    if (!confirm("Approve this roster? It will become read-only.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
    } else {
      const d = await res.json();
      setError(d.error || "Approve failed");
    }
  }

  async function resetRoster() {
    if (!roster) return;
    if (
      !confirm(
        "Reset this roster back to DRAFT? Status will revert and all sections become editable again."
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setRoster(d.roster);
    } else {
      const d = await res.json();
      setError(d.error || "Reset failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Month</label>
          <select
            className="input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="">— select —</option>
            {rosters.map((r) => (
              <option key={r._id} value={r.month}>
                {monthLabel(r.month)} ({r.status.replace(/_/g, " ")})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Or start a new month</label>
          <div className="flex items-end gap-2">
            <input
              type="month"
              className="input"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
            />
            <button className="btn-brass" disabled={busy} onClick={createMonth}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
        {roster && (
          <button className="btn-secondary" onClick={() => setShowPreview(true)}>
            Preview roster
          </button>
        )}
        {roster && (
          <div className="ml-auto">
            <StatusBadge status={roster.status} />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-clay-600" role="alert" aria-live="polite">{error}</p>}
      {note && <p className="text-sm text-sage-700" aria-live="polite">{note}</p>}

      {roster && (
        <>
          {roster.status === "WORSHIP_FILLED" && (
            <div className="card p-4 border-l-4 border-l-brass-400 bg-brass-50/50 space-y-2">
              <p className="text-sm">
                <strong>Worship portion submitted.</strong> Review the worship
                team columns (read-only) then fill the rest.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[240px]">
                  <label className="label">
                    Reason (if sending back to Worship)
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. Need a different preacher on week 2"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
                <button
                  className="btn-secondary"
                  disabled={busy || !rejectReason.trim()}
                  onClick={rejectToWorship}
                >
                  Send back to Worship
                </button>
              </div>
            </div>
          )}

          {roster.status === "SERVICE_FILLED" && (
            <div className="card p-4 border-l-4 border-l-ink-400 bg-ink-50/60">
              <p className="text-sm">
                <strong>Service portion complete.</strong> An admin can approve
                below, or reset to make changes.
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" disabled={busy} onClick={approve}>
                  Approve roster
                </button>
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={resetRoster}
                >
                  Reset to draft
                </button>
              </div>
            </div>
          )}

          {roster.status === "APPROVED" && (
            <div className="card p-4 border-l-4 border-l-sage-400 bg-sage-100/50">
              <p className="text-sm">
                <strong>This roster is APPROVED and read-only.</strong>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn-primary"
                  onClick={() => setShowPreview(true)}
                >
                  Download / Print PDF
                </button>
                {isAdmin && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={resetRoster}
                  >
                    Reset to draft &amp; make changes
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action bar for DRAFT/WORSHIP_FILLED */}
          {(roster.status === "DRAFT" || roster.status === "WORSHIP_FILLED") && (
            <div className="flex justify-end">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={submitForApproval}
              >
                Submit for approval →
              </button>
            </div>
          )}

          <AbsencePanel
            month={roster.month}
            absences={roster.absences || []}
            editable={canEdit(roster)}
            busy={busy}
            onSave={saveAbsences}
          />

          {canEdit(roster) && (
            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy} onClick={generateAll}>
                {busy ? "Generating…" : isAdmin ? "Auto-fill all roles" : "Auto-fill service roles"}
              </button>
            </div>
          )}

          <RosterGrid
            roster={roster}
            editable={canEdit(roster)}
            editableSlots={isAdmin ? undefined : SERVICE_SLOTS}
            onWeekSave={saveWeek}
            busy={busy}
          />

          {/* Legend */}
          <div className="card p-3 text-xs text-ink-500">
            <strong className="text-ink-700">Columns:</strong>{" "}
            {WORSHIP_SLOTS.map((s) => (
              <span key={String(s)} className="mr-1">
                <span className="bg-brass-100 text-brass-700 px-1 rounded">{String(s)}</span>
              </span>
            ))}
            <span>are owned by the Worship Coordinator (read-only here).</span>
          </div>
        </>
      )}

      {/* Roster preview / PDF modal */}
      {showPreview && roster && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-auto p-4 print-modal">
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] w-full my-4">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-lg no-print">
              <h2 className="font-semibold text-lg">Roster Preview — {monthLabel(roster.month)}</h2>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => window.print()}>
                  Download / Print PDF
                </button>
                <button className="btn-secondary" onClick={() => setShowPreview(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <RosterPrintView roster={roster} rules={rules || undefined} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RosterStatus }) {
  const map: Record<RosterStatus, string> = {
    DRAFT: "bg-ink-50 text-ink-600",
    WORSHIP_FILLED: "bg-brass-100 text-brass-700",
    SERVICE_FILLED: "bg-ink-100 text-ink-700",
    APPROVED: "bg-sage-100 text-sage-700",
  };
  const labels: Record<RosterStatus, string> = {
    DRAFT: "Draft",
    WORSHIP_FILLED: "Worship filled",
    SERVICE_FILLED: "Service filled",
    APPROVED: "Approved",
  };
  return (
    <span className={`badge ${map[status]} text-sm py-1 px-3`}>
      {labels[status]}
    </span>
  );
}

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
