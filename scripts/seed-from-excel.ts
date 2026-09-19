/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * One-time seed: imports people + capabilities + reference rosters from the
 * July & August 2026 ECF Service Roster Excel files into MongoDB.
 *
 * Run with:  npm run seed
 *
 * Env: MONGODB_URI (and optionally MONGODB_DB) must be set, e.g. via .env.local.
 * Pass --keep to skip the (interactive) wipe confirmation and keep existing docs.
 *
 * What gets imported:
 *  - people:  deduped list with capabilities, parsed from the reference table
 *             at the bottom of each Sheet1 (rows under "W. Leader | Singers | …").
 *  - rules:   a single Rules doc (DEFAULT_RULES) if none exists yet.
 *  - rosters: July & August rosters reconstructed from the per-week rows at the
 *             top of each Sheet1. These are reference data the algorithm uses
 *             for "previous month" checks (usher pairings, Chris/Donald alt).
 *
 * The script is idempotent: re-running upserts people by name and replaces the
 * July/August rosters if they already exist.
 */

import path from "node:path";
import * as XLSX from "xlsx";
import { MongoClient, type Collection } from "mongodb";
import type {
  CapabilityKey,
  Person,
  Roster,
  WeekAssignments,
} from "../src/lib/types";
import { DEFAULT_RULES } from "../src/lib/defaultRules";
import { firstSaturday, sundaysInMonth, weekIndexOfSunday } from "../src/lib/dates";

const DB_NAME = process.env.MONGODB_DB || "ecf_roster";
const ROOT = path.resolve(__dirname, "..", "..");
const FILES = [
  { month: "2026-07", file: path.join(ROOT, "07 - ECF Service Roster JUL 2026.xlsx") },
  { month: "2026-08", file: path.join(ROOT, "08 - ECF Service Roster AUG 2026.xlsx") },
];

// ---------------------------------------------------------------------------
// Name normalisation — matches lib/rules.ts (strip ALL whitespace + lowercase).
// ---------------------------------------------------------------------------
function norm(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Reference-table parsing (people × capabilities).
// ---------------------------------------------------------------------------
// Header row in the reference table looks like:
//   | W. Leader | Singers | Piano | Drums | Guitar | Bass | Freeshow | Sound | Cam | HC (Sun) | HC Servers | Ushers | Counting | Toilets (M) | Toilets (F) |
// Columns are capability pools. Each column below the header is a list of names.
const HEADER_TO_CAP: Record<string, CapabilityKey> = {
  "w. leader": "worshipLeader",
  singers: "singer",
  piano: "piano",
  drums: "drums",
  guitar: "guitar",
  bass: "bass",
  freeshow: "freeshow",
  sound: "sound",
  cam: "camera",
  "hc (sun)": "hcConductor",
  "hc servers": "hcServer",
  ushers: "usher",
  counting: "counting",
  "toilets (m)": "toiletM",
  "toilets (f)": "toiletF",
};

export interface Sheet {
  rows: string[][];
}

export function readSheet(file: string): Sheet {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Sheet1"];
  if (!ws) throw new Error(`Sheet1 not found in ${file}`);
  const raw = XLSX.utils.sheet_to_json<string[][]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  return {
    rows: raw.map((r) => (r as unknown[]).map((c) => String(c || "").trim())),
  };
}

/**
 * Find the reference table and return { name → Set<CapabilityKey> }.
 * The table starts at a row whose 2nd cell is "W. Leader" and contains a row
 * of capability headers. Names below each header fill the corresponding cap.
 */
export function parseReferenceTable(sheets: Sheet[]): Map<string, Set<CapabilityKey>> {
  const caps = new Map<string, Set<CapabilityKey>>();
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      // Header row: find a cell whose norm is "w.leader".
      const headerIdx = row.findIndex((c) => norm(c) === "w.leader");
      if (headerIdx < 0) continue;
      // Map each column index → CapabilityKey.
      const colCaps: Record<number, CapabilityKey> = {};
      for (let i = headerIdx; i < row.length; i++) {
        const h = norm(row[i]);
        const cap = HEADER_TO_CAP[h];
        if (cap) colCaps[i] = cap;
      }
      // Read subsequent rows until we hit a blank row.
      const allRows = sheet.rows;
      const startIdx = allRows.indexOf(row);
      for (let r = startIdx + 1; r < allRows.length; r++) {
        const r2 = allRows[r];
        // Stop on a fully blank row OR a row that looks like a new section
        // (e.g. "Rotation 4 | KITCHEN | …").
        const nonEmpty = r2.filter((c) => c);
        if (nonEmpty.length === 0) break;
        if (nonEmpty.some((c) => /rotation|kitchen|café|cafe|vacuum|team/i.test(c))) {
          break;
        }
        for (const [iStr, cap] of Object.entries(colCaps)) {
          const i = Number(iStr);
          const name = cleanName(r2[i]);
          if (!name) continue;
          const set = caps.get(name) || new Set<CapabilityKey>();
          set.add(cap);
          caps.set(name, set);
        }
      }
      return caps; // first match is enough
    }
  }
  return caps;
}

// ---------------------------------------------------------------------------
// Per-week roster parsing (top-of-sheet service blocks).
// ---------------------------------------------------------------------------
//
// Each service day is a vertical block of rows whose first cell starts with a
// date like "4-Jul" (and possibly a "BREAK" suffix). The block has:
//
//   r0:  <date> |              | P: <piano>  |  | <S: strings?> |  | Conductor: <hcConductor> | HC Setup: <name> | ...
//   r1:  <singer> |            | G: <guitar> |  | ...
//   r2:  <singer> |            | B: <bass>   |  | HC servers: <s1> | <s2> | ...
//   r3:  <singer> |            | D: <drums>  |  | ...
//   r4:  <singer> |            | F: <freeshow> |  | Ushers: <u1> | <u2> | ...
//   r5:                | Cam: <camera>      |  | <u3> | <u4>
//
// Plus separate "Toilet (M):" / "Toilet (F):" rows somewhere in the block.
// The columns vary slightly between files; we scan cells for the labeled
// prefixes rather than relying on fixed column offsets.

interface ParsedWeek {
  date: string; // ISO yyyy-mm-dd
  isSaturday: boolean;
  singers: string[];
  piano?: string;
  guitar?: string;
  bass?: string;
  drums?: string;
  freeshow?: string;
  strings?: string;
  camera?: string;
  hcConductor?: string;
  hcServers: string[];
  hcSetup: string[];
  ushers: string[];
  counting: string[];
  toiletM?: string;
  toiletF?: string;
  preaching?: string;
}

// Convert "4-Jul" + year → "2026-07-04".
function dayMonthToIso(text: string, year: number): string | null {
  const m = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthName = m[2];
  const monthNum = MONTHS[monthName.toLowerCase().slice(0, 3)];
  if (!monthNum) return null;
  return `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Trim suffixes like "BREAK", footnote markers, "(head)" etc. Also handle
// parenthesised helper notes. We keep just the bare name(s).
export function cleanName(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  // Drop footnote markers (* and ^).
  s = s.replace(/[*^]/g, "");
  // Drop a trailing "BREAK" marker that sometimes appears inside the date cell.
  s = s.replace(/\bBREAK\b/gi, "").trim();
  // Strip leading prefixes (Ps, U., Aunty, etc.) but KEEP the name itself.
  // (We keep prefixes since the rules reference "Ps Ludwig" etc.)
  // Remove anything in parentheses.
  s = s.replace(/\([^)]*\)/g, "").trim();
  // Collapse internal whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Split a cell that contains multiple names separated by "/", ",", " & ", " and ".
function splitNames(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[/,&]|\band\b/i)
    .map(cleanName)
    .filter((s) => s && !/^(note|toilet|vacuum|conductor|hc\s|ushers|counting|s\b|p\b|g\b|b\b|d\b|f\b|cam|team|break)/i.test(s));
}

function parsePreachingCell(raw: string): string | undefined {
  // Preaching cell often looks like "Ps Ludwig + Hock" or "Francisca/Mathias".
  // We take the first name only.
  const s = cleanName(raw);
  if (!s) return undefined;
  return splitNames(s)[0];
}

export function parseWeeks(sheet: Sheet, year: number, monthStr: string): ParsedWeek[] {
  const weeks: ParsedWeek[] = [];
  const rows = sheet.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateCell = cleanName(row[0] || "");
    // Skip the reference table (rows with header "W. Leader").
    if (norm(row[1] || "") === "w.leader") break;
    // The cell must start with a date like "4-Jul".
    const isoDate = dayMonthToIso(dateCell, year);
    if (!isoDate) continue;
    if (!isoDate.startsWith(monthStr)) continue;

    // Gather this block: subsequent rows until the next date row or a long gap.
    const block: string[][] = [row];
    for (let j = i + 1; j < rows.length; j++) {
      const nextRow = rows[j];
      const nextDate = cleanName(nextRow[0] || "");
      if (dayMonthToIso(nextDate, year)) break;
      // Stop at blank row OR a row whose first cell looks like a section heading.
      const nonEmpty = nextRow.filter((c) => c);
      if (nonEmpty.length === 0) break;
      if (/^(pack up|please note|punctuality|time|rotation|kitchen|café|cafe|vacuum|away dates|\*)/i.test(nextDate)) {
        break;
      }
      block.push(nextRow);
    }

    const week = parseWeekBlock(block, isoDate);
    if (week) weeks.push(week);
  }
  return weeks;
}

function parseWeekBlock(block: string[][], isoDate: string): ParsedWeek | null {
  const isSaturday = new Date(isoDate).getDay() === 6;
  const w: ParsedWeek = {
    date: isoDate,
    isSaturday,
    singers: [],
    hcServers: [],
    hcSetup: [],
    ushers: [],
    counting: [],
  };

  // The sheet has a LEFT block (cols A..R = 0..17) and a parallel RIGHT block
  // starting at col U (20) with its own "HC & Offering" header. We only parse
  // the LEFT block to avoid contaminating HC/usher/counting lists.
  const MAX_COL = 18;

  // Preaching column is R (index 17). Grab the first non-empty cell in col 17
  // across the block (it's where the preacher name lives).
  for (let r = 0; r < block.length; r++) {
    const v = cleanName(block[r][17] || "");
    if (v && !/^(note|time|sunday|friday|break|l,)/i.test(v) && !w.preaching) {
      w.preaching = parsePreachingCell(v);
    }
  }

  // Walk every cell in the LEFT block, looking for labels.
  // Run-state is per-row: it starts when we see a label and ends when we hit
  // the next label OR a column beyond MAX_COL.
  for (let r = 0; r < block.length; r++) {
    const row = block[r];
    let run: "hcServers" | "ushers" | "counting" | null = null;

    for (let c = 0; c < Math.min(row.length, MAX_COL); c++) {
      const cell = cleanName(row[c]);
      if (!cell) continue;
      const low = cell.toLowerCase();

      // Musician single-letter labels: P:, G:, B:, D:, F:, S:
      if (/^[PGDBFS]:?$/.test(cell)) {
        const value = cleanName(row[c + 1] || "");
        const cap = cell[0];
        if (value) {
          if (cap === "P") w.piano = value;
          else if (cap === "G") w.guitar = value;
          else if (cap === "B") w.bass = value;
          else if (cap === "D") w.drums = value;
          else if (cap === "F") w.freeshow = value;
          else if (cap === "S") w.strings = value;
        }
        run = null;
        continue;
      }

      // Camera.
      if (/^cam(era)?:?$/.test(low)) {
        const v = cleanName(row[c + 1] || "");
        if (v) w.camera = v;
        run = null;
        continue;
      }

      // Conductor: <name>
      if (low === "conductor:") {
        const v = cleanName(row[c + 1] || "");
        if (v) w.hcConductor = v;
        run = null;
        continue;
      }

      // HC Setup: <name>  (may be a label like "HOSPITALITY" or "NOTE: …")
      if (low === "hc setup:") {
        const v = cleanName(row[c + 1] || "");
        if (v && !/^(note|hospitality|team)/i.test(v)) {
          for (const n of splitNames(v)) if (!w.hcSetup.includes(n)) w.hcSetup.push(n);
        }
        run = null;
        continue;
      }

      // HC servers: starts a run.
      if (low === "hc servers:") {
        run = "hcServers";
        const first = cleanName(row[c + 1] || "");
        if (first) for (const n of splitNames(first)) if (!w.hcServers.includes(n)) w.hcServers.push(n);
        continue;
      }

      // Ushers: starts a run.
      if (low === "ushers:") {
        run = "ushers";
        const first = cleanName(row[c + 1] || "");
        if (first) for (const n of splitNames(first)) if (!w.ushers.includes(n)) w.ushers.push(n);
        continue;
      }

      // Counting: starts a run.
      if (low === "counting:") {
        run = "counting";
        const first = cleanName(row[c + 1] || "");
        if (first) for (const n of splitNames(first)) if (!w.counting.includes(n)) w.counting.push(n);
        continue;
      }

      // Toilet (M) / Toilet (F).
      if (low === "toilet (m):") {
        const v = cleanName(row[c + 1] || "");
        if (v) w.toiletM = v;
        run = null;
        continue;
      }
      if (low === "toilet (f):") {
        const v = cleanName(row[c + 1] || "");
        if (v) w.toiletF = v;
        run = null;
        continue;
      }

      // Singers: col 1 (B) of each row holds one singer name.
      if (c === 1 && /^[A-Z]/.test(cell)) {
        if (!/^(conductor|hc|ushers|counting|toilet|cam|sound|p:|g:|b:|d:|f:|s:|team|note|time|sunday|friday|vacuum)/i.test(cell)) {
          if (!w.singers.includes(cell)) w.singers.push(cell);
        }
      }

      // Continuation of a run: stop at any recognized label, otherwise collect.
      // Also cap at the HOSPITALITY column boundary (col 9) since ushers/counting
      // live in the HC & Offering block (cols 6–9) before hospitality takes over.
      if (run && c > 0) {
        const pastHcBlock = c >= 10;
        const isLabel =
          /^toilet\b/i.test(cell) ||
          low === "counting:" ||
          low === "ushers:" ||
          low === "hc servers:" ||
          low === "hc setup:" ||
          low === "conductor:" ||
          /^cam(era)?:?$/.test(low) ||
          /^[PGDBFS]:?$/.test(cell) ||
          /^(vacuum|car park|note|team|hospitality|all bring)/i.test(cell);
        if (isLabel || pastHcBlock) {
          run = null;
        } else {
          const names = splitNames(cell);
          for (const n of names) {
            if (run === "hcServers" && !w.hcServers.includes(n)) w.hcServers.push(n);
            else if (run === "ushers" && !w.ushers.includes(n)) w.ushers.push(n);
            else if (run === "counting" && !w.counting.includes(n)) w.counting.push(n);
          }
        }
      }
    }
  }

  // Dedup HC setup (Ezekiel / Ammon appear in every block).
  w.hcSetup = [...new Set(w.hcSetup)];
  return w;
}

// ---------------------------------------------------------------------------
// ParsedWeek → WeekAssignments
// ---------------------------------------------------------------------------
function toWeekAssignment(pw: ParsedWeek): WeekAssignments {
  return {
    date: pw.date,
    day: pw.isSaturday ? "saturday" : "sunday",
    hospitality: [],
    preaching: pw.preaching,
    singers: pw.singers,
    piano: pw.piano,
    guitar: pw.guitar,
    bass: pw.bass,
    drums: pw.drums,
    freeshow: pw.freeshow,
    strings: pw.strings,
    camera: pw.camera,
    hcConductor: pw.hcConductor,
    hcServers: pw.hcServers,
    hcSetup: pw.hcSetup,
    counting: pw.counting,
    ushers: pw.ushers,
    toiletM: pw.toiletM,
    toiletF: pw.toiletF,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Copy .env.local.example to .env.local.");
    process.exit(1);
  }
  console.log(`Connecting to MongoDB (${DB_NAME})…`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);
  const peopleCol = db.collection<Person>("people");
  const rulesCol = db.collection<RulesDoc>("rules");
  const rostersCol = db.collection<Roster>("rosters");

  // Read sheets.
  const sheets = FILES.map((f) => {
    console.log(`Reading ${path.basename(f.file)}…`);
    return readSheet(f.file);
  });

  // --- People + capabilities ---
  const capMap = parseReferenceTable(sheets);
  console.log(`Found ${capMap.size} distinct people in reference tables.`);

  // Also collect every name that appears anywhere in the parsed weeks, so we
  // don't miss people who are rostered but absent from the reference table.
  const allWeeks: { month: string; year: number; weeks: ParsedWeek[] }[] = [];
  for (let i = 0; i < FILES.length; i++) {
    const year = Number(FILES[i].month.slice(0, 4));
    const weeks = parseWeeks(sheets[i], year, FILES[i].month);
    allWeeks.push({ month: FILES[i].month, year, weeks });
    // Pull every name out of each week into the cap map (no caps if unknown).
    for (const w of weeks) {
      const names = [
        ...w.singers,
        w.piano, w.guitar, w.bass, w.drums, w.freeshow, w.strings,
        w.camera, w.hcConductor, ...w.hcServers, ...w.hcSetup,
        ...w.ushers, ...w.counting, w.toiletM, w.toiletF, w.preaching,
      ].filter(Boolean) as string[];
      for (const n of names) {
        const key = cleanName(n);
        if (!key) continue;
        if (!capMap.has(key)) capMap.set(key, new Set());
      }
    }
  }
  console.log(`Total people after merging roster names: ${capMap.size}.`);

  // Upsert people.
  let inserted = 0, updated = 0;
  for (const [name, caps] of capMap) {
    const doc: Person = {
      name,
      active: true,
      capabilities: [...caps],
      awayDates: [],
    };
    const res = await peopleCol.updateOne(
      { name },
      { $set: doc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) inserted++;
    else updated++;
  }
  console.log(`People: ${inserted} inserted, ${updated} updated.`);

  // --- Rules (only if missing) ---
  const existingRules = await rulesCol.findOne({});
  if (existingRules) {
    console.log("Rules doc already exists — leaving untouched.");
  } else {
    await rulesCol.insertOne({ ...DEFAULT_RULES } as RulesDoc);
    console.log("Rules: inserted DEFAULT_RULES.");
  }

  // --- Rosters ---
  for (const { month, weeks } of allWeeks) {
    const saturdays: WeekAssignments[] = [];
    const sundays: WeekAssignments[] = [];
    for (const pw of weeks) {
      const wa = toWeekAssignment(pw);
      if (pw.isSaturday) saturdays.push(wa);
      else sundays.push(wa);
    }
    // Ensure Sundays are sorted by date.
    sundays.sort((a, b) => a.date.localeCompare(b.date));

    const now = new Date();
    const doc: Omit<Roster, "_id"> = {
      month,
      status: "APPROVED", // reference rosters are historical
      saturdays,
      sundays,
      warnings: [],
      auditLog: [
        {
          at: now.toISOString(),
          by: "seed-script",
          action: "seed",
          detail: `Imported from ${month} Excel reference`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await rostersCol.replaceOne({ month }, doc as Roster, { upsert: true });
    console.log(`Roster ${month}: ${sundays.length} Sundays, ${saturdays.length} Saturday.`);
  }

  await client.close();
  console.log("\n✓ Seed complete.");
}

// Helpers re-declared locally so we don't pull server-only code paths in.
type RulesDoc = typeof DEFAULT_RULES;

// Only run main() when invoked directly (`npm run seed`), not when imported
// by the test harness.
const isMain = (() => {
  try {
    return require.main === module || process.env.npm_lifecycle_event === "seed";
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
}

// Silence the unused-import warning for Collection (kept for clarity).
void (null as unknown as Collection);
