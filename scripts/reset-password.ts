/**
 * Direct database password reset for admins.
 *
 * Usage:
 *   npx tsx scripts/reset-password.ts user@example.com "NewPass123"
 *
 * Reads MONGODB_URI / MONGODB_DB from .env.local (same as the app).
 * Useful when a user is fully locked out and the reset-link flow can't be used.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
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
  // Fall back to process env (e.g. Vercel / CI).
}

async function main() {
  const [, , rawEmail, rawPassword] = process.argv;
  const email = String(rawEmail || "").trim().toLowerCase();
  const password = String(rawPassword || "");
  if (!email || !email.includes("@") || password.length < 8) {
    console.error('Usage: npx tsx scripts/reset-password.ts user@example.com "NewPassword8+"');
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Check .env.local (see .env.local.example).");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB || "ecf_roster";
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection("users");
    const user = await col.findOne({ email });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await col.updateOne({ email }, { $set: { passwordHash } });
    // Invalidate any outstanding reset tokens for this account.
    await client
      .db(dbName)
      .collection("password_resets")
      .deleteMany({ email })
      .catch(() => undefined);
    console.log(`Password reset for ${email} (${(user as { name?: string }).name || "unknown name"}).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}
);
