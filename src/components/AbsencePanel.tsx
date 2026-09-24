"use client";

import { useEffect, useMemo, useState } from "react";
import type { MonthAbsence, Person, WeekAssignments } from "@/lib/types";
import { monthLabel } from "@/lib/dates";

interface AbsencePanelProps {
  month: string;
  absences: MonthAbsence[];
  editable: boolean;
  busy?: boolean;
  onSave: (absences: MonthAbsence[]) => void | Promise<void>;
  // All service weeks of this month (saturdays + sundays). When provided, the
  // panel previews hard-validation conflicts before saving (i.e. the person is
  // already rostered on a day their new/edited absence covers).
  weeks?: WeekAssignments[];
}

// First and last day of the month, used to bound the date pickers.
function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

/**
 * AbsencePanel is the "start of month" step: record who is away and for how
 * long before auto-filling. Absent people are never auto-rostered on any
 * Saturday/Sunday they overlap. Ranges may run past month-end; the overflow is
 * carried into the next month automatically when that month is opened.
 */
export default function AbsencePanel({
  month,
  absences,
  editable,
  busy,
  onSave,
  weeks,
}: AbsencePanelProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Inline edit state — null means "adding", a number means "editing that row".
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editNote, setEditNote] = useState("");

  const { first, last } = useMemo(() => monthBounds(month), [month]);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.people) setPeople(d.people); })
      .catch(() => {});
  }, []);

  // Default the "from" date to the first of the month once known.
  useEffect(() => {
    if (!from) setFrom(first);
  }, [first, from]);

  function addAbsence() {
    setError(null);
    if (!name.trim()) { setError("Pick a person."); return; }
    if (!from) { setError("Choose a start date."); return; }
    if (to && to < from) { setError("End date can't be before the start date."); return; }
    const entry: MonthAbsence = {
      personName: name.trim(),
      from,
      ...(to ? { to } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    onSave([...absences, entry]);
    setName("");
    setTo("");
    setNote("");
    setFrom(first);
  }

  function removeAbsence(idx: number) {
    setError(null);
    // If we were editing this row (or one after it), reset edit state so the
    // form doesn't point at a stale index.
    if (editingIdx !== null) {
      if (editingIdx === idx) cancelEdit();
      else if (editingIdx > idx) setEditingIdx(editingIdx - 1);
    }
    onSave(absences.filter((_, i) => i !== idx));
  }

  function startEdit(idx: number) {
    const a = absences[idx];
    if (!a) return;
    setError(null);
    setEditingIdx(idx);
    setEditName(a.personName);
    setEditFrom(a.from);
    setEditTo(a.to || "");
    setEditNote(a.note || "");
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditName("");
    setEditFrom("");
    setEditTo("");
    setEditNote("");
  }

  function saveEdit() {
    if (editingIdx === null) return;
    setError(null);
    if (!editName.trim()) { setError("Pick a person."); return; }
    if (!editFrom) { setError("Choose a start date."); return; }
    if (editTo && editTo < editFrom) { setError("End date can't be before the start date."); return; }
    const entry: MonthAbsence = {
      personName: editName.trim(),
      from: editFrom,
      ...(editTo ? { to: editTo } : {}),
      ...(editNote.trim() ? { note: editNote.trim() } : {}),
      // Preserve the carry marker (if any) so forward-propagation bookkeeping
      // survives an edit.
      ...(((absences[editingIdx] as MonthAbsence & { carriedFrom?: string }).carriedFrom)
        ? { carriedFrom: (absences[editingIdx] as MonthAbsence & { carriedFrom?: string }).carriedFrom }
        : {}),
    };
    const next = absences.map((a, i) => (i === editingIdx ? entry : a));
    onSave(next);
    cancelEdit();
  }

  // Dates in this month where `personName` is already rostered (any slot) AND
  // covered by the [from, to] range — saving will raise hard warnings for these.
  function rosterConflicts(personName: string, fromD: string, toD: string): string[] {
    if (!weeks?.length || !personName.trim() || !fromD) return [];
    const end = toD || fromD;
    const target = personName.trim().toLowerCase().replace(/\s+/g, "");
    const hits: string[] = [];
    for (const w of weeks) {
      const d = w.date;
      if (d < fromD || d > end) continue;
      const names: string[] = [];
      for (const [k, v] of Object.entries(w)) {
        if (k === "date" || k === "day") continue;
        // Overlap crews (hospitality/kitchen/cafe) are exempt from hard
        // away-date validation — ignore them here too.
        if (k === "hospitality" || k === "hospitalityLeads" || k === "hospitalityTeam" || k === "kitchen" || k === "cafe") continue;
        if (typeof v === "string" && v) names.push(v);
        else if (Array.isArray(v)) names.push(...(v as string[]));
      }
      if (names.some((n) => n.trim().toLowerCase().replace(/\s+/g, "") === target)) hits.push(d);
    }
    return hits;
  }

  const addConflicts = rosterConflicts(name, from, to);
  const editConflicts = editingIdx !== null ? rosterConflicts(editName, editFrom, editTo) : [];

  function fmtRange(a: MonthAbsence): string {
    if (!a.to || a.to === a.from) return a.from;
    return `${a.from} → ${a.to}`;
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Before you begin</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Who&apos;s away in {monthLabel(month)}?
          </h2>
        </div>
        <p className="text-xs text-ink-500 max-w-md">
          Anyone listed here won&apos;t be auto-rostered on the days they&apos;re away.
          Ranges that run into next month carry forward automatically. If no one is
          away, just leave this empty and proceed.
        </p>
      </div>

      {absences.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-100/60 rounded-xl border border-ink-100">
          {absences.map((a, idx) => (
            <li key={idx} className="px-4 py-2.5 text-sm">
              {editingIdx === idx ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label" htmlFor={`abs-edit-name-${idx}`}>Person</label>
                    <select
                      id={`abs-edit-name-${idx}`}
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    >
                      <option value="">— select —</option>
                      {/* Keep the current name selectable even if they left People. */}
                      {!people.some((p) => p.name === editName) && editName && (
                        <option value={editName}>{editName} (removed)</option>
                      )}
                      {people.map((p) => (
                        <option key={String(p._id)} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`abs-edit-from-${idx}`}>Away from</label>
                    <input
                      id={`abs-edit-from-${idx}`}
                      type="date"
                      className="input"
                      value={editFrom}
                      onChange={(e) => setEditFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`abs-edit-to-${idx}`}>Until (optional)</label>
                    <input
                      id={`abs-edit-to-${idx}`}
                      type="date"
                      className="input"
                      min={editFrom || undefined}
                      value={editTo}
                      onChange={(e) => setEditTo(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <label className="label" htmlFor={`abs-edit-note-${idx}`}>Note (optional)</label>
                    <input
                      id={`abs-edit-note-${idx}`}
                      type="text"
                      className="input"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={busy} onClick={saveEdit}>
                      Save
                    </button>
                    <button type="button" className="btn-ghost" disabled={busy} onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-ink-800">{a.personName}</span>
                    <span className="ml-2 text-ink-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {fmtRange(a)}
                    </span>
                    {a.note && <span className="ml-2 text-ink-400 italic truncate">{a.note}</span>}
                    {(a as MonthAbsence & { carriedFrom?: string }).carriedFrom && (
                      <span className="ml-2 rounded bg-brass-100 px-1.5 py-0.5 text-xs text-brass-700">
                        carried from {(a as MonthAbsence & { carriedFrom?: string }).carriedFrom}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-ink-600 hover:text-ink-800 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => startEdit(idx)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-clay-600 hover:text-clay-500 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => removeAbsence(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-ink-100 bg-parchment-100/50 px-4 py-3 text-sm text-ink-500">
          No absences recorded — everyone is available this month.
        </p>
      )}

      {/* Inline hard-validation preview while editing. */}
      {editingIdx !== null && editConflicts.length > 0 && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
          ⚠ {editName} is already rostered on {editConflicts.join(", ")}. Saving will flag hard
          validation errors on those dates — regenerate or reassign them after saving.
        </p>
      )}

      {editable && editingIdx === null && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="abs-name">Person</label>
            <select
              id="abs-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            >
              <option value="">— select —</option>
              {people.map((p) => (
                <option key={String(p._id)} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="abs-from">Away from</label>
            <input
              id="abs-from"
              type="date"
              className="input"
              min={first}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="abs-to">Until (optional)</label>
            <input
              id="abs-to"
              type="date"
              className="input"
              min={from || first}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="label" htmlFor="abs-note">Note (optional)</label>
            <input
              id="abs-note"
              type="text"
              className="input"
              placeholder="e.g. holiday"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={addAbsence}>
            Add absence
          </button>
        </div>
      )}

      {/* Hard-validation preview for the pending new entry. */}
      {editable && editingIdx === null && addConflicts.length > 0 && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
          ⚠ {name} is already rostered on {addConflicts.join(", ")}. Adding will flag hard
          validation errors on those dates — regenerate or reassign them after saving.
        </p>
      )}

      {(to && from && to > last) && (
        <p className="mt-2 text-xs text-brass-700">
          This absence runs past {monthLabel(month)} and will carry into next month automatically.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-clay-600">{error}</p>}
    </section>
  );
}
