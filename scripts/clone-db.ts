/**
 * Clone roster setup data from one MongoDB database to another.
 *
 * Copies the DATA collections (people, rules, settings) so a fresh database
 * (e.g. the Vercel-provisioned MongoDB) matches your working database.
 *
 *   npx tsx scripts/clone-db.ts "<DEST_MONGODB_URI>" [--include-rosters] [--include-users]
 *
 * Source = MONGODB_URI / MONGODB_DB from .env.local (your current working DB).
 * Dest DB name = --dest-db <name> or MONGODB_DB fallback (default `ecf_roster`).
 *
 * Safety:
 *   - `users` are SKIPPED by default (so nobody gets locked out / test accounts
 *     don't leak into production). Pass --include-users only if you mean it.
 *   - `rosters` are SKIPPED by default (use --include-rosters to copy them;
 *     months that already exist at the destination are left untouched).
 *   - `password_resets` tokens are NEVER copied.
 *   - people/rules/settings at the destination are REPLACED (drop + reinsert).
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

const ALWAYS_COPY = ["people", "rules", "settings"] as const;

async function main() {
  const args = process.argv.slice(2);
  const destUri = args.find((a) => !a.startsWith("--"));
  const includeRosters = args.includes("--include-rosters");
  const includeUsers = args.includes("--include-users");
  const destDbArg = args.indexOf("--dest-db");
  const destDbName =
    (destDbArg >= 0 && args[destDbArg + 1]) ||
    process.env.MONGODB_DB ||
    "ecf_roster";

  const srcUri = process.env.MONGODB_URI;
  const srcDbName = process.env.MONGODB_DB || "ecf_roster";

  if (!srcUri) {
    console.error("Source MONGODB_URI is not set (check .env.local).");
    process.exit(1);
  }
  if (!destUri) {
    console.error(
      'Usage: npx tsx scripts/clone-db.ts "<DEST_MONGODB_URI>" [--include-rosters] [--include-users] [--dest-db <name>]'
    );
    process.exit(1);
  }
  if (destUri === srcUri) {
    console.error("Source and destination are the same database. Aborting.");
    process.exit(1);
  }

  const collections = [
    ...ALWAYS_COPY,
    ...(includeRosters ? (["rosters"] as const) : []),
    ...(includeUsers ? (["users"] as const) : []),
  ];

  const src = new MongoClient(srcUri);
  const dest = new MongoClient(destUri);
  await src.connect();
  await dest.connect();
  try {
    const srcDb = src.db(srcDbName);
    const destDb = dest.db(destDbName);
    console.log(`Source:      ${srcDbName} (${summarize(srcUri)})`);
    console.log(`Destination: ${destDbName} (${summarize(destUri)})`);

    for (const name of collections) {
      const docs = await srcDb.collection(name).find({}).toArray();
      if (name === "rosters" && !includeRosters) continue;
      if (name === "rosters" && includeRosters) {
        // Add only months missing at destination; never overwrite.
        const existing = new Set(
          (
            await destDb.collection(name).find({}).project({ month: 1 }).toArray()
          ).map((r) => (r as { month?: string }).month)
        );
        const fresh = docs.filter(
          (d) => !existing.has((d as { month?: string }).month)
        );
        if (fresh.length) await destDb.collection(name).insertMany(fresh);
        console.log(
          `✓ rosters: ${fresh.length} added, ${docs.length - fresh.length} already present (skipped)`
        );
        continue;
      }
      const clean = docs.map((d) => {
        const { _id, ...rest } = d as Record<string, unknown>;
        void _id;
        return rest;
      });
      await destDb.collection(name).deleteMany({});
      if (clean.length) await destDb.collection(name).insertMany(clean);
      console.log(`✓ ${name}: replaced with ${clean.length} document(s)`);
    }
    console.log("\nDone. Verify at /api/health (people/rules counts).");
  } finally {
    await src.close();
    await dest.close();
  }
}

function summarize(uri: string): string {
  // Show host + db only — never print credentials.
  try {
    const u = new URL(uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"));
    return u.host;
  } catch {
    return "<uri>";
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
