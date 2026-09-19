"use client";

import { useEffect, useState } from "react";
import type { Rules } from "@/lib/types";
import { DEFAULT_RULES } from "@/lib/defaultRules";

export default function RulesEditor() {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/rules");
    if (res.ok) { const d = await res.json(); setRules(d.rules || DEFAULT_RULES); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setError(null); setBusy(true); setSaved(false);
    const res = await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function set<K extends keyof Rules>(key: K, val: Rules[K]) {
    setRules({ ...rules, [key]: val });
  }

  function csvList(val: string[]): string {
    return val.join(", ");
  }
  function parseCsv(s: string): string[] {
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }

  // Serialize the conflict pairs (one pair per line) for the textarea.
  function conflictsToText(pairs: [string, string][]): string {
    return pairs.map(([a, b]) => `${a}, ${b}`).join("\n");
  }
  // Parse a textarea block back into pairs (one pair per line, comma-separated).
  function textToConflicts(text: string): [string, string][] {
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const p = line.split(",").map((s) => s.trim());
        return [p[0] || "", p[1] || ""] as [string, string];
      });
  }

  // HC server pairs serialization (reuses same format as conflicts).
  function pairsToText(pairs: [string, string][]): string {
    return pairs.map(([a, b]) => `${a}, ${b}`).join("\n");
  }
  function textToPairs(text: string): [string, string][] {
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const p = line.split(",").map((s) => s.trim());
        return [p[0] || "", p[1] || ""] as [string, string];
      });
  }

  // Pair constraints: { Name: "noOtherRole" } ↔ "Name, noOtherRole\n..."
  function constraintsToText(obj: Record<string, string>): string {
    return Object.entries(obj).map(([k, v]) => `${k}, ${v}`).join("\n");
  }
  function textToConstraints(text: string): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const line of text.split("\n").filter(Boolean)) {
      const [name, ...rest] = line.split(",").map((s) => s.trim());
      if (name && rest.length) obj[name] = rest.join(",");
    }
    return obj;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-green-700">✓ Rules saved.</p>}

      <Section title="Worship Leader cycle">
        <p className="text-xs text-gray-500 mb-1">Round-robin order. Names in &quot;Skip&quot; are kept in the system but not auto-rostered.</p>
        <Field label="Cycle (comma-separated)" value={csvList(rules.worshipLeaderCycle)} onChange={v => set("worshipLeaderCycle", parseCsv(v))} />
        <Field label="Skip" value={csvList(rules.worshipLeaderSkip)} onChange={v => set("worshipLeaderSkip", parseCsv(v))} />
      </Section>

      <Section title="HC Conductors">
        <p className="text-xs text-gray-500 mb-1">Priority order for Sunday. Saturday has its own list. Chris/Donald can&apos;t conduct when preaching.</p>
        <Field label="Sunday priority" value={csvList(rules.hcConductorPriority)} onChange={v => set("hcConductorPriority", parseCsv(v))} />
        <Field label="Saturday only" value={csvList(rules.hcConductorSaturday)} onChange={v => set("hcConductorSaturday", parseCsv(v))} />
      </Section>

      <Section title="HC Setup (fixed)">
        <Field label="People" value={csvList(rules.hcSetupPeople)} onChange={v => set("hcSetupPeople", parseCsv(v))} />
      </Section>

      <Section title="HC Servers">
        <p className="text-xs text-gray-500 mb-1">Pairs: one pair per line (e.g. &quot;Chris, Karen&quot;). The 3rd server comes from a separate pool.</p>
        <Field label="Server pairs (one pair per line)" value={pairsToText(rules.hcServerPairs || [])} onChange={v => set("hcServerPairs", textToPairs(v))} textarea />
        <Field label="Pair constraints (one per line: Name, constraint)" value={constraintsToText(rules.hcServerPairConstraints || {})} onChange={v => set("hcServerPairConstraints", textToConstraints(v))} textarea />
        <Field label="Fallback pool (legacy)" value={csvList(rules.hcServerPool)} onChange={v => set("hcServerPool", parseCsv(v))} />
        <Field label="3rd-server pool" value={csvList(rules.hcServerThirdPool)} onChange={v => set("hcServerThirdPool", parseCsv(v))} />
        <Field label="If Dino is 3rd, exclude from worship" value={csvList(rules.hcServerDinoConflicts)} onChange={v => set("hcServerDinoConflicts", parseCsv(v))} />
      </Section>

      <Section title="Preaching rotation">
        <p className="text-xs text-gray-500 mb-1">Week 1–5. Separate multiple options with comma (they alternate).</p>
        {rules.preachingRotation.map((r, i) => (
          <Field key={i} label={`Week ${r.week}`} value={r.options.join(", ")} onChange={v => {
            const arr = [...rules.preachingRotation];
            arr[i] = { week: r.week, options: parseCsv(v) };
            set("preachingRotation", arr);
          }} />
        ))}
      </Section>

      <Section title="Ushers">
        <Field label="Experts (senior)" value={csvList(rules.usherExperts)} onChange={v => set("usherExperts", parseCsv(v))} />
        <Field label="Young" value={csvList(rules.usherYoung)} onChange={v => set("usherYoung", parseCsv(v))} />
        <NumField label="Max per month" value={rules.usherMaxPerMonth} onChange={v => set("usherMaxPerMonth", v)} />
        <BoolField label="Back-to-back allowed" value={rules.usherBackToBackAllowed} onChange={v => set("usherBackToBackAllowed", v)} />
      </Section>

      <Section title="Counting">
        <Field label="Seniors" value={csvList(rules.countingSeniors)} onChange={v => set("countingSeniors", parseCsv(v))} />
        <Field label="Juniors" value={csvList(rules.countingJuniors)} onChange={v => set("countingJuniors", parseCsv(v))} />
        <Field label="Conflict pairs (one pair per line, comma-separated)" value={conflictsToText(rules.countingConflicts)} onChange={v => set("countingConflicts", textToConflicts(v))} textarea />
      </Section>

      <Section title="Saturday-unavailable">
        <p className="text-xs text-gray-500 mb-1">These people cannot be rostered on 1st-Saturday service.</p>
        <Field label="Names" value={csvList(rules.saturdayUnavailable)} onChange={v => set("saturdayUnavailable", parseCsv(v))} />
      </Section>

      <Section title="Exclusions">
        <p className="text-xs text-gray-500 mb-1">People on break won&apos;t be rostered anywhere. Role-specific skips exclude from that role only.</p>
        <Field label="Global skip (on break)" value={csvList(rules.globalSkip || [])} onChange={v => set("globalSkip", parseCsv(v))} />
        <Field label="HC Server skip" value={csvList(rules.hcServerSkip || [])} onChange={v => set("hcServerSkip", parseCsv(v))} />
        <Field label="Freeshow skip" value={csvList(rules.freeshowSkip || [])} onChange={v => set("freeshowSkip", parseCsv(v))} />
        <Field label="Drums priority (prefer for drums, deprioritize on freeshow)" value={csvList(rules.drumsPriority || [])} onChange={v => set("drumsPriority", parseCsv(v))} />
      </Section>

      <Section title="Per-week counts">
        <NumField label="Singers per week" value={rules.singersPerWeek} onChange={v => set("singersPerWeek", v)} />
        <NumField label="HC servers per week" value={rules.hcServersPerWeek} onChange={v => set("hcServersPerWeek", v)} />
        <NumField label="Ushers per week" value={rules.ushersPerWeek} onChange={v => set("ushersPerWeek", v)} />
        <NumField label="Counting team size" value={rules.countingTeamSize} onChange={v => set("countingTeamSize", v)} />
      </Section>

      <Section title="PDF footer text">
        <p className="text-xs text-gray-500 mb-1">Shown at the bottom of the printed/PDF roster.</p>
        <Field label="Pack up (tables/chairs/urn/drinks)" value={rules.pdfFooter?.packUp || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, packUp: v })} />
        <Field label="Bins" value={rules.pdfFooter?.bins || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, bins: v })} />
        <Field label="Third HC server note" value={rules.pdfFooter?.thirdServerNote || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, thirdServerNote: v })} />
        <Field label="Bold names note" value={rules.pdfFooter?.boldNamesNote || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, boldNamesNote: v })} textarea />
        <Field label="Please note" value={rules.pdfFooter?.pleaseNote || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, pleaseNote: v })} textarea />
        <Field label="Punctuality note" value={rules.pdfFooter?.punctualityNote || ""} onChange={v => set("pdfFooter", { ...rules.pdfFooter, punctualityNote: v })} textarea />
      </Section>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card p-5 space-y-3"><h2 className="font-semibold">{title}</h2>{children}</div>;
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea className="input min-h-[80px] font-mono text-xs" value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input w-24" type="number" min={0} value={value} onChange={e => onChange(parseInt(e.target.value) || 0)} />
    </div>
  );
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
