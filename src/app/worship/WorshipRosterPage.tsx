"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/dates";
import type { MonthAbsence, Roster, WeekAssignments } from "@/lib/types";
import RosterGrid from "@/components/RosterGrid";
import AbsencePanel from "@/components/AbsencePanel";

export default function WorshipRosterPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const sp = useSearchParams();
  const [month, setMonth] = useState(sp.get("month") || "");
  const [rosters, setRosters] = useState<{ _id: string; month: string; status: string }[]>([]);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMonth, setNewMonth] = useState(nextMonth());

  const loadList = useCallback(async () => {
    const res = await fetch("/api/roster");
    if (res.ok) { const d = await res.json(); setRosters(d.rosters || []); }
  }, []);

  async function createMonth() {
    setBusy(true); setError(null);
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: newMonth }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to create month"); return; }
    await loadList();
    setMonth(newMonth);
  }

  const loadRoster = useCallback(async (m: string) => {
    setRoster(null); setError(null);
    const item = rosters.find(r => r.month === m);
    if (!item) { setError("Roster not found for " + m); return; }
    const res = await fetch(`/api/roster/${item._id}`);
    if (res.ok) { const d = await res.json(); setRoster(d.roster); setMonth(m); }
    else { const d = await res.json(); setError(d.error); }
  }, [rosters]);

  useEffect(() => { loadList(); }, [loadList]);

  // When month changes from dropdown, load that roster
  useEffect(() => {
    if (month && rosters.length) loadRoster(month);
  }, [month, rosters, loadRoster]);

  async function generateWorship() {
    if (!roster) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: roster.month, worshipOnly: !isAdmin, rosterId: roster._id, absences: roster.absences || [] }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error); return; }
    const d = await res.json();
    if (d.roster) {
      setRoster({ ...d.roster, _id: roster._id });
    }
  }

  async function saveAbsences(absences: MonthAbsence[]) {
    if (!roster) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absences }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); setRoster(d.roster); }
    else { const d = await res.json(); setError(d.error); }
  }

  async function saveWeek(week: WeekAssignments) {
    if (!roster) return;
    setBusy(true);
    const sats = roster.saturdays.map(w => w.date === week.date ? week : w);
    const suns = roster.sundays.map(w => w.date === week.date ? week : w);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saturdays: sats, sundays: suns }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); setRoster(d.roster); }
    else { const d = await res.json(); setError(d.error); }
  }

  async function submitToService() {
    if (!roster) return;
    if (!confirm("Send to Admin? Worship cells will be locked for editing.")) return;
    setBusy(true);
    const res = await fetch(`/api/roster/${roster._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "worship_submit" }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); setRoster(d.roster); }
    else { const d = await res.json(); setError(d.error); }
  }

  const isLocked = roster?.status !== "DRAFT";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Month</label>
          <select className="input" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="">— select —</option>
            {rosters.map(r => (
              <option key={r._id} value={r.month}>{monthLabel(r.month)} ({r.status})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Or start a new month</label>
          <div className="flex items-end gap-2">
            <input type="month" className="input" value={newMonth} onChange={e => setNewMonth(e.target.value)} />
            <button className="btn-brass" disabled={busy} onClick={createMonth}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
        {roster && !isLocked && (
          <button className="btn-secondary" disabled={busy} onClick={submitToService}>
            Send to Admin →
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {roster && isLocked && (
        <div className="badge bg-blue-100 text-blue-800 text-sm py-1 px-3">
          Status: {roster.status.replace(/_/g, " ")} — worship portion is locked.
        </div>
      )}

      {roster && (
        <AbsencePanel
          month={roster.month}
          absences={roster.absences || []}
          editable={!isLocked}
          busy={busy}
          onSave={saveAbsences}
        />
      )}

      {roster && !isLocked && (
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={generateWorship}>
            {busy ? "Generating…" : isAdmin ? "Auto-fill all roles" : "Auto-fill worship"}
          </button>
        </div>
      )}

      {roster && (
        <RosterGrid
          roster={roster}
          editable={!isLocked}
          editableSlots={isAdmin ? undefined : ["worshipLeader", "singers", "piano", "guitar", "bass", "drums", "freeshow", "strings"]}
          onWeekSave={saveWeek}
          busy={busy}
        />
      )}
    </div>
  );
}

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
