"use client";

import { useEffect, useMemo, useState } from "react";
import type { MonthAbsence, Person } from "@/lib/types";
import { monthLabel } from "@/lib/dates";

interface AbsencePanelProps {
  month: string;
  absences: MonthAbsence[];
  editable: boolean;
  busy?: boolean;
  onSave: (absences: MonthAbsence[]) => void | Promise<void>;
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
}: AbsencePanelProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    onSave(absences.filter((_, i) => i !== idx));
  }

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
            <li key={idx} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-ink-800">{a.personName}</span>
                <span className="ml-2 text-ink-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtRange(a)}
                </span>
                {a.note && <span className="ml-2 text-ink-400 italic truncate">{a.note}</span>}
              </div>
              {editable && (
                <button
                  type="button"
                  className="text-sm font-medium text-clay-600 hover:text-clay-500 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => removeAbsence(idx)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-ink-100 bg-parchment-100/50 px-4 py-3 text-sm text-ink-500">
          No absences recorded — everyone is available this month.
        </p>
      )}

      {editable && (
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

      {(to && from && to > last) && (
        <p className="mt-2 text-xs text-brass-700">
          This absence runs past {monthLabel(month)} and will carry into next month automatically.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-clay-600">{error}</p>}
    </section>
  );
}
