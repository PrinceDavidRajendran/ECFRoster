"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CapabilityKey,
  Person,
  Roster,
  Warning,
  WeekAssignments,
} from "@/lib/types";
import { CAPABILITY_LABELS } from "@/lib/types";
import { monthLabel } from "@/lib/dates";

/**
 * RosterGrid renders a month's roster as an editable table that mirrors the
 * Excel layout. Each row is a service day (Saturday or Sunday); each column
 * is a role slot. Editing is cell-by-cell via a <Slot> control.
 *
 * Editing is gated two ways:
 *  - `editable` false ⇒ entire grid is read-only (e.g. APPROVED month).
 *  - `editableSlots`  ⇒ restricts which columns the current user may touch.
 *    Worship coord gets only worship slots; service coord gets the rest.
 */

// Column definitions: which key on WeekAssignments, what type, and the
// capability used to populate the suggestion <option> list.
type ColKind = "single" | "multi" | "multi-free";

interface ColumnDef {
  key: keyof WeekAssignments;
  label: string;
  kind: ColKind;
  cap?: CapabilityKey; // for option population
  fixedOptions?: string[]; // fixed dropdown choices (e.g. hospitality team)
}

const COLUMNS: ColumnDef[] = [
  { key: "preaching", label: "Preaching", kind: "single", cap: "preaching" },
  { key: "worshipLeader", label: "W. Leader", kind: "single", cap: "worshipLeader" },
  { key: "piano", label: "Piano", kind: "single", cap: "piano" },
  { key: "guitar", label: "Guitar", kind: "single", cap: "guitar" },
  { key: "bass", label: "Bass", kind: "single", cap: "bass" },
  { key: "drums", label: "Drums", kind: "single", cap: "drums" },
  { key: "freeshow", label: "Freeshow", kind: "single", cap: "freeshow" },
  { key: "singers", label: "Singers", kind: "multi", cap: "singer" },
  { key: "sound", label: "Sound", kind: "single", cap: "sound" },
  { key: "camera", label: "Camera", kind: "single", cap: "camera" },
  { key: "hcConductor", label: "HC Cond.", kind: "single", cap: "hcConductor" },
  { key: "hcServers", label: "HC Servers", kind: "multi", cap: "hcServer" },
  { key: "hcSetup", label: "HC Setup", kind: "multi", cap: "hcSetup" },
  { key: "ushers", label: "Ushers", kind: "multi", cap: "usher" },
  { key: "counting", label: "Counting", kind: "multi", cap: "counting" },
  { key: "toiletM", label: "Toilet M", kind: "single", cap: "toiletM" },
  { key: "toiletF", label: "Toilet F", kind: "single", cap: "toiletF" },
  { key: "hospitalityTeam", label: "Hosp. Team", kind: "single", fixedOptions: ["A", "B", "combined", "none"] },
  { key: "hospitality", label: "Hospitality", kind: "multi", cap: "hospitality" },
  { key: "hospitalityLeads", label: "Hosp. Leads ^", kind: "multi", cap: "hospitality" },
  { key: "kitchen", label: "Kitchen", kind: "multi", cap: "kitchen" },
  { key: "cafe", label: "Cafe", kind: "multi", cap: "cafe" },
];

interface RosterGridProps {
  roster: Roster;
  editable: boolean;
  editableSlots?: (keyof WeekAssignments)[]; // undefined ⇒ all editable
  onWeekSave: (week: WeekAssignments) => void | Promise<void>;
  busy?: boolean;
}

export default function RosterGrid({
  roster,
  editable,
  editableSlots,
  onWeekSave,
  busy,
}: RosterGridProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Record<string, WeekAssignments>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  // Load people list once for option population.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.people)) setPeople(d.people);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset drafts whenever the roster changes (e.g. after a save).
  useEffect(() => {
    const map: Record<string, WeekAssignments> = {};
    for (const w of [...roster.saturdays, ...roster.sundays]) {
      map[w.date] = structuredClone(w);
    }
    setDraft(map);
    setDirty(new Set());
  }, [roster]);

  // Map slot → people who have that capability, for the option lists.
  const optionMap = useMemo(() => {
    const m = new Map<CapabilityKey, Person[]>();
    for (const c of [
      "preaching",
      "worshipLeader",
      "piano",
      "guitar",
      "bass",
      "drums",
      "freeshow",
      "strings",
      "singer",
      "sound",
      "camera",
      "hcConductor",
      "hcServer",
      "hcSetup",
      "usher",
        "counting",
        "toiletM",
        "toiletF",
        "hospitality",
        "kitchen",
        "cafe",
      ] as CapabilityKey[]) {
      // Hospitality uses fixed A/B teams; the capability may not be set on
      // people, so offer every active person for manual edits.
      if (c === "hospitality") {
        m.set(c, people.filter((p) => p.active));
      } else {
        const pool = people.filter((p) => p.active && p.capabilities.includes(c));
        // Toilet (M/F) pools are small and were missing from some databases
        // (seeded before the reference table was parsed). Never leave the
        // dropdown empty — fall back to all active people so the slot stays
        // assignable until Admin → People capabilities are backfilled.
        if ((c === "toiletM" || c === "toiletF") && pool.length === 0) {
          m.set(c, people.filter((p) => p.active));
        } else {
          m.set(c, pool);
        }
      }
      void CAPABILITY_LABELS[c];
    }
    return m;
  }, [people]);

  // Warnings indexed by date+slot for badge rendering.
  const warningMap = useMemo(() => {
    const m = new Map<string, Warning[]>();
    for (const w of roster.warnings || []) {
      const key = `${w.date}|${w.slot}`;
      const arr = m.get(key) || [];
      arr.push(w);
      m.set(key, arr);
    }
    return m;
  }, [roster.warnings]);

  function canEdit(key: keyof WeekAssignments): boolean {
    if (!editable) return false;
    if (!editableSlots) return true;
    return editableSlots.includes(key);
  }

  function updateWeek(date: string, next: WeekAssignments) {
    setDraft((d) => ({ ...d, [date]: next }));
    setDirty((s) => new Set(s).add(date));
  }

  async function saveWeek(date: string) {
    const w = draft[date];
    if (!w) return;
    await onWeekSave(w);
    // onWeekSave typically refreshes roster, which clears `dirty` via effect.
  }

  function revertWeek(date: string) {
    const original =
      [...roster.saturdays, ...roster.sundays].find((w) => w.date === date) ||
      draft[date];
    setDraft((d) => ({ ...d, [date]: structuredClone(original) }));
    setDirty((s) => {
      const n = new Set(s);
      n.delete(date);
      return n;
    });
  }

  const weeks = [...roster.saturdays, ...roster.sundays];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">
          {monthLabel(roster.month)}{" "}
          <span className="text-sm font-normal text-gray-500">
            ({weeks.length} service{weeks.length === 1 ? "" : "s"})
          </span>
        </h2>
        {(roster.warnings || []).length > 0 && (
          <span className="badge badge-soft">
            {roster.warnings.length} validation warning
            {roster.warnings.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold border-b border-r">
                Date
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={String(c.key)}
                  className="px-2 py-2 text-left font-semibold border-b border-r whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
              {editable && (
                <th className="px-3 py-2 border-b sticky right-0 z-10 bg-gray-50">
                  &nbsp;
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const dw = draft[w.date] || w;
              const isDirty = dirty.has(w.date);
              const isSaturday = w.day === "saturday";
              return (
                <tr key={w.date} className="border-b last:border-0 align-top">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r font-medium whitespace-nowrap">
                    <div>{formatDate(w.date)}</div>
                    <div className="text-xs text-gray-500">
                      {isSaturday ? "Saturday" : "Sunday"}
                    </div>
                  </td>
                  {COLUMNS.map((c) => {
                    // No preaching on Saturday
                    if (c.key === "preaching" && isSaturday) {
                      return <td key={String(c.key)} className="px-2 py-2 border-r min-w-[120px] text-gray-300">—</td>;
                    }
                    return (
                      <td key={String(c.key)} className="px-2 py-2 border-r min-w-[120px]">
                        <Slot
                          column={c}
                          week={dw}
                          options={
                            c.cap ? optionMap.get(c.cap) || [] : []
                          }
                          editable={canEdit(c.key)}
                          warnings={
                            warningMap.get(`${w.date}|${String(c.key)}`) || []
                          }
                          onChange={(next) => updateWeek(w.date, next)}
                        />
                      </td>
                    );
                  })}
                  {editable && (
                    <td className="sticky right-0 z-10 bg-white px-2 py-2">
                      {isDirty ? (
                        <div className="flex flex-col gap-1">
                          <button
                            className="btn-primary text-xs px-2 py-1"
                            disabled={busy}
                            onClick={() => saveWeek(w.date)}
                          >
                            Save
                          </button>
                          <button
                            className="btn-ghost text-xs px-2 py-1"
                            disabled={busy}
                            onClick={() => revertWeek(w.date)}
                          >
                            Undo
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">✓</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(roster.warnings || []).length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-2">Validation warnings</h3>
          <ul className="space-y-1 text-sm">
            {(roster.warnings || []).map((w, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={
                    w.severity === "hard" ? "badge badge-hard" : "badge badge-soft"
                  }
                >
                  {w.severity}
                </span>
                <span className="text-gray-700">
                  <strong>{formatDate(w.date)}</strong> · {w.slot}: {w.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot — a single editable cell.
// ---------------------------------------------------------------------------

interface SlotProps {
  column: ColumnDef;
  week: WeekAssignments;
  options: Person[];
  editable: boolean;
  warnings: Warning[];
  onChange: (next: WeekAssignments) => void;
}

function Slot({ column, week, options, editable, warnings, onChange }: SlotProps) {
  const { key, kind } = column;

  if (kind === "single") {
    const value = String((week[key] as string | undefined) || "");
    if (!editable) {
      return <CellText value={value} warnings={warnings} />;
    }
    // Fixed-choice dropdown (e.g. hospitality team A/B/combined/none).
    if (column.fixedOptions) {
      return (
        <select
          className="input min-w-[110px] py-1"
          value={value}
          onChange={(e) => onChange({ ...week, [key]: e.target.value || undefined })}
        >
          <option value="">—</option>
          {column.fixedOptions.map((o) => (
            <option key={o} value={o}>
              {o === "combined" ? "Combined" : o === "none" ? "None (break)" : `Team ${o}`}
            </option>
          ))}
        </select>
      );
    }
    return (
      <select
        className="input min-w-[110px] py-1"
        value={value}
        onChange={(e) => onChange({ ...week, [key]: e.target.value || undefined })}
      >
        <option value="">—</option>
        {options.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  // Multi-select list (chips with remove).
  const values = (week[key] as string[]) || [];
  if (!editable) {
    return (
      <CellList values={values} warnings={warnings} />
    );
  }

  function add(name: string) {
    if (!name) return;
    if (values.includes(name)) return;
    onChange({ ...week, [key]: [...values, name] });
  }
  function remove(name: string) {
    onChange({ ...week, [key]: values.filter((v) => v !== name) });
  }

  const available = options
    .filter((p) => !values.includes(p.name))
    .map((p) => p.name);

  return (
    <div className="space-y-1">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded text-xs"
            >
              {v}
              <button
                type="button"
                className="text-brand-400 hover:text-brand-700"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {column.kind === "multi" ? (
        <select
          className="input min-w-[110px] py-1"
          value=""
          onChange={(e) => add(e.target.value)}
        >
          <option value="">+ add…</option>
          {available.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        // multi-free: free text input (e.g. HC Setup people may not be in pool).
        <FreeTextInput
          placeholder="+ add name"
          onSubmit={add}
        />
      )}
      {warnings.length > 0 && <WarningDots warnings={warnings} />}
    </div>
  );
}

function FreeTextInput({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <input
      className="input min-w-[110px] py-1"
      placeholder={placeholder}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = val.trim();
          if (v) {
            onSubmit(v);
            setVal("");
          }
        }
      }}
    />
  );
}

function CellText({ value, warnings }: { value: string; warnings: Warning[] }) {
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <div>
      <span className="text-gray-800">{value}</span>
      {warnings.length > 0 && <WarningDots warnings={warnings} />}
    </div>
  );
}

function CellList({ values, warnings }: { values: string[]; warnings: Warning[] }) {
  if (values.length === 0) return <span className="text-gray-300">—</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs"
          >
            {v}
          </span>
        ))}
      </div>
      {warnings.length > 0 && <WarningDots warnings={warnings} />}
    </div>
  );
}

function WarningDots({ warnings }: { warnings: Warning[] }) {
  const hard = warnings.filter((w) => w.severity === "hard").length;
  const soft = warnings.filter((w) => w.severity === "soft").length;
  return (
    <div className="flex gap-1">
      {hard > 0 && (
        <span className="badge badge-hard" title={`${hard} hard violation(s)`}>
          ! {hard}
        </span>
      )}
      {soft > 0 && (
        <span className="badge badge-soft" title={`${soft} soft warning(s)`}>
          ? {soft}
        </span>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
