"use client";

import type { Roster, Rules, WeekAssignments } from "@/lib/types";
import { monthLabel } from "@/lib/dates";
import { DEFAULT_RULES } from "@/lib/defaultRules";

// Renders the roster in the ECF Service Roster print layout (A4 landscape).
// Populated fields come from the roster; sections we don't fill yet
// (Kitchen, Cafe, Vacuum, Bins) are kept as labelled placeholders
// to match the original PDF. Hospitality is fully rostered (Team A/B).

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  const mon = d.toLocaleString("en-AU", { month: "short" });
  return `${day}-${mon}`;
}

function j(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v.filter(Boolean).join(", ") : v;
}

function WeekBlock({ w }: { w: WeekAssignments }) {
  const singers = w.singers || [];
  const hcServers = w.hcServers || [];
  const ushers = w.ushers || [];
  const counting = w.counting || [];
  const hcSetup = (w.hcSetup || []).join(" / ");
  // Mark the 3rd HC server with "*" (stationed at the back).
  const servers = hcServers.map((s, i) => (i === 2 ? `*${s}` : s));

  return (
    <tr className="week-row">
      {/* DATE */}
      <td className="cell date-cell">
        <div className="date-main">{fmtDate(w.date)}</div>
        <div className="date-day">{w.day === "saturday" ? "Saturday" : "Sunday"}</div>
      </td>

      {/* SINGERS */}
      <td className="cell">
        {w.worshipLeader && <div className="lead">{w.worshipLeader} <span className="role-tag">(WL)</span></div>}
        {singers.map((s, i) => (
          <div key={i}>{s}</div>
        ))}
      </td>

      {/* MUSICIANS */}
      <td className="cell musicians">
        <div><span className="lbl">P:</span> {w.piano || ""}</div>
        <div><span className="lbl">G:</span> {w.guitar || ""}</div>
        <div><span className="lbl">B:</span> {w.bass || ""}</div>
        <div><span className="lbl">D:</span> {w.drums || ""}</div>
        <div><span className="lbl">F:</span> {w.freeshow || ""}</div>
      </td>

      {/* MEDIA */}
      <td className="cell">
        <div><span className="lbl">S:</span> {w.sound || ""}</div>
        <div><span className="lbl">Cam:</span> {w.camera || ""}</div>
      </td>

      {/* PREACHING */}
      <td className="cell preaching-cell">{w.preaching || ""}</td>

      {/* HC & OFFERING */}
      <td className="cell hc">
        <div><span className="lbl">Conductor:</span> {w.hcConductor || ""}</div>
        <div><span className="lbl">HC Servers:</span> {j(servers)}</div>
        <div><span className="lbl">HC Setup:</span> {hcSetup}</div>
      </td>

      {/* USHERS */}
      <td className="cell">{j(ushers)}</td>

      {/* COUNTING */}
      <td className="cell">{j(counting)}</td>

      {/* TOILETS */}
      <td className="cell toilets">
        <div><span className="lbl">M:</span> {w.toiletM || ""}</div>
        <div><span className="lbl">F:</span> {w.toiletF || ""}</div>
      </td>

      {/* HOSPITALITY */}
      <td className="cell">
        <HospitalityCell w={w} />
      </td>

      {/* KITCHEN */}
      <td className="cell">
        {(w.kitchen || []).map((s, i) => (
          <div key={i}>{s}</div>
        ))}
      </td>

      {/* CAFE */}
      <td className="cell">
        {(w.cafe || []).map((s, i) => (
          <div key={i}>{s}</div>
        ))}
      </td>
    </tr>
  );
}

function HospitalityCell({ w }: { w: WeekAssignments }) {
  const team = (w.hospitalityTeam || "").trim();
  const hosp = w.hospitality || [];
  const leads = new Set((w.hospitalityLeads || []).map((s) => s.toLowerCase()));
  if (team === "none" || (!team && hosp.length === 0)) {
    return <span className="text-gray-500 italic">HOSPITALITY BREAK</span>;
  }
  if (team === "combined") {
    return (
      <div>
        <div className="lead">Combined hospitality team</div>
        {hosp.map((s, i) => (
          <div key={i}>{s}{leads.has(s.toLowerCase()) ? "^" : ""}</div>
        ))}
      </div>
    );
  }
  if (team === "A" || team === "B") {
    return (
      <div>
        <div className="lead">Team {team}</div>
        {hosp.map((s, i) => (
          <div key={i} className={leads.has(s.toLowerCase()) ? "lead" : undefined}>
            {s}{leads.has(s.toLowerCase()) ? "^" : ""}
          </div>
        ))}
      </div>
    );
  }
  // Fallback: list names if team flag is unset (legacy data).
  if (hosp.length > 0) {
    return (
      <div>
        {hosp.map((s, i) => (
          <div key={i}>{s}{leads.has(s.toLowerCase()) ? "^" : ""}</div>
        ))}
      </div>
    );
  }
  return <span className="text-gray-300">—</span>;
}

export default function RosterPrintView({ roster, rules }: { roster: Roster; rules?: Rules }) {
  const weeks = [...(roster.saturdays || []), ...(roster.sundays || [])].sort(
    (a, b) => a.date.localeCompare(b.date)
  );
  const footer = rules?.pdfFooter || DEFAULT_RULES.pdfFooter;

  return (
    <div className="roster-print">
      <div className="print-header">
        EVANGEL CHRISTIAN FELLOWSHIP — SERVICE ROSTER —{" "}
        {monthLabel(roster.month).toUpperCase()}
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>DATE</th>
            <th>SINGERS</th>
            <th>MUSICIANS</th>
            <th>MEDIA</th>
            <th>PREACHING</th>
            <th>HC &amp; OFFERING</th>
            <th>USHERS</th>
            <th>COUNTING</th>
            <th>TOILETS</th>
            <th>HOSPITALITY</th>
            <th>KITCHEN</th>
            <th>CAFE</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <WeekBlock key={w.date} w={w} />
          ))}
        </tbody>
      </table>

      <div className="print-footer">
        <table className="footer-tasks">
          <tbody>
            <tr>
              <td className="ft-label">Pack up (wipe) tables+chairs/Urn+drinks:</td>
              <td className="ft-value">{footer.packUp}</td>
              <td className="ft-label">Bins:</td>
              <td className="ft-value">{footer.bins}</td>
            </tr>
          </tbody>
        </table>
        <p>{footer.thirdServerNote}</p>
        <p>{footer.boldNamesNote}</p>
        <p>{footer.pleaseNote}</p>
        <p className="quote">{footer.punctualityNote}</p>
      </div>
    </div>
  );
}
