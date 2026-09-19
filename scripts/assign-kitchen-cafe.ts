/**
 * Assign Kitchen & Cafe capabilities (observed JUL–SEP 2026 rosters) and set
 * the kitchen/cafe rule fields.
 *
 * Run locally (uses .env.local):
 *   npx tsx scripts/assign-kitchen-cafe.ts
 *
 * Run against another database (e.g. the Vercel MongoDB):
 *   npx tsx scripts/assign-kitchen-cafe.ts "<MONGODB_URI>" [--db <name>]
 *
 * - Adds "kitchen" to everyone seen on kitchen duty (dropdown pool).
 * - Adds "cafe" to the fixed 5-person cafe team (dropdown pool).
 * - Sets rules.kitchenLeads / kitchenPool / kitchenPerWeek / cafeTeam
 *   (from DEFAULT_RULES, so code and DB stay in sync).
 * Idempotent: re-running only adds missing entries.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { DEFAULT_RULES } from "../src/lib/defaultRules";

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

// Seen on KITCHEN across JUL–SEP 2026 (xlsx + published PDFs).
const KITCHEN_PEOPLE = [
  "David",
  "Suzanna",
  "Alif",
  "Pax",
  "Jullianne",
  "Grace",
  "Amy",
  "Ida",
  "Deepi",
  "Elizabeth",
  "Jarrod",
];

// Fixed CAFE team — identical every serving Sunday JUL–SEP 2026.
const CAFE_PEOPLE = ["Elizabeth", "Aira", "Richard", "Jarrod", "Ammon"];

async function main() {
  const args = process.argv.slice(2);
  const uri = args.find((a) => !a.startsWith("--")) || process.env.MONGODB_URI;
  const dbArg = args.indexOf("--db");
  const dbName =
    (dbArg >= 0 && args[dbArg + 1]) || process.env.MONGODB_DB || "ecf_roster";
  if (!uri) {
    console.error(
      'Usage: npx tsx scripts/assign-kitchen-cafe.ts ["<MONGODB_URI>"] [--db <name>]'
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

    await addCap(KITCHEN_PEOPLE, "kitchen");
    await addCap(CAFE_PEOPLE, "cafe");

    // "Ida" serves on kitchen (13-Sep) + hospitality Team B but has no person
    // record yet (missing from the Excel reference table). Create her so she
    // appears in dropdowns; other capabilities can be added in Admin → People.
    const ida = await people.findOne({ name: "Ida" });
    if (!ida) {
      await people.insertOne({
        name: "Ida",
        active: true,
        capabilities: ["kitchen"],
        awayDates: [],
        notes: "Added 2026-09: seen on kitchen + hospitality Team B",
      });
      console.log('✓ "Ida": created with kitchen capability');
    } else if (!((ida.capabilities || []) as string[]).includes("kitchen")) {
      await people.updateOne({ name: "Ida" }, { $addToSet: { capabilities: "kitchen" } });
      console.log('✓ "Ida": kitchen capability added');
    } else {
      console.log('✓ "Ida": already present with kitchen capability');
    }

    // Sync the kitchen/cafe rule knobs from code defaults.
    const rules = db.collection("rules");
    const existing = await rules.findOne({});
    const patch = {
      kitchenLeads: DEFAULT_RULES.kitchenLeads,
      kitchenPool: DEFAULT_RULES.kitchenPool,
      kitchenPerWeek: DEFAULT_RULES.kitchenPerWeek,
      cafeTeam: DEFAULT_RULES.cafeTeam,
    };
    if (existing) {
      await rules.updateOne({ _id: existing._id }, { $set: patch });
    } else {
      const { _id, ...defaults } = DEFAULT_RULES;
      void _id;
      await rules.insertOne(defaults as never);
    }
    console.log("✓ rules: kitchen/cafe fields set from DEFAULT_RULES");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
