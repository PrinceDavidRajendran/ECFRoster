/**
 * Assign Toilet (M) / Toilet (F) capabilities (observed JUL–SEP 2026 rosters).
 *
 * Run locally (uses .env.local):
 *   npx tsx scripts/assign-toilet-capabilities.ts
 *
 * Run against another database (e.g. the Vercel MongoDB):
 *   npx tsx scripts/assign-toilet-capabilities.ts "<MONGODB_URI>" [--db <name>]
 *
 * - Adds "toiletM" to everyone seen on Toilet (M) duty (dropdown pool).
 * - Adds "toiletF" to everyone seen on Toilet (F) duty (dropdown pool).
 * Idempotent: re-running only adds missing entries.
 *
 * Source of truth:
 * - 07 JUL 2026 xlsx reference table (cols "Toilets (M)" / "Toilets (F)") +
 *   weekly assignments (05/12/19/26-Jul)
 * - 08 AUG 2026 PDF (02/09/16/23/30-Aug)
 * - 09 SEP 2026 PDF (06/13/20/27-Sep)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

// Load .env.local manually (no dotenv dependency — same pattern as other scripts).
try {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // Fall back to process env.
}

// Seen on TOILET (M) across JUL–SEP 2026 (xlsx reference table + weekly
// assignments; identical set in the AUG xlsx reference table).
const TOILET_M_PEOPLE = [
  "Mathias",
  "David",
  "Izaac",
  "Richard",
  "Pax",
  "Alif",
  "Ammon",
  "Jarrod",
];

// Seen on TOILET (F) across JUL–SEP 2026.
const TOILET_F_PEOPLE = ["Elizabeth", "Suzanna", "Jullianne", "Aira"];

async function main() {
  const args = process.argv.slice(2);
  const uri = args.find((a) => !a.startsWith("--")) || process.env.MONGODB_URI;
  const dbArg = args.indexOf("--db");
  const dbName =
    (dbArg >= 0 && args[dbArg + 1]) || process.env.MONGODB_DB || "ecf_roster";
  if (!uri) {
    console.error(
      'Usage: npx tsx scripts/assign-toilet-capabilities.ts ["<MONGODB_URI>"] [--db <name>]'
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const people = db.collection("people");

    const addCap = async (names: string[], cap: string) => {
      const missing: string[] = [];
      for (const name of names) {
        const res = await people.updateOne(
          { name },
          { $addToSet: { capabilities: cap } }
        );
        if (res.matchedCount === 0) missing.push(name);
      }
      console.log(
        `✓ "${cap}": ${names.length - missing.length}/${names.length} people updated` +
          (missing.length ? ` (NOT FOUND: ${missing.join(", ")})` : "")
      );
    };

    await addCap(TOILET_M_PEOPLE, "toiletM");
    await addCap(TOILET_F_PEOPLE, "toiletF");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
