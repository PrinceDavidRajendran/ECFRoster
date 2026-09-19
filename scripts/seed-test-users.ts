/**
 * Seeds mock login accounts for every role so all flows can be tested.
 * Idempotent: re-running updates the password/role of existing accounts.
 * Also migrates any legacy "service" users to "admin" (roles were merged).
 *
 * Run: npx tsx scripts/seed-test-users.ts
 *
 * Logins (all use the same password):
 *   admin@ecf.test    / test1234   (Admin)
 *   worship@ecf.test  / test1234   (Worship Coordinator)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const envFile = readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const PASSWORD = "test1234";

const TEST_USERS = [
  { email: "admin@ecf.test", name: "Test Admin", role: "admin" },
  { email: "worship@ecf.test", name: "Test Worship Coordinator", role: "worship" },
] as const;

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "ecf_roster");
  const col = db.collection("users");

  // Roles were merged: promote any legacy service coordinators to admin.
  const migrated = await col.updateMany({ role: "service" }, { $set: { role: "admin" } });
  if (migrated.modifiedCount > 0) {
    console.log(`↪ migrated ${migrated.modifiedCount} legacy "service" user(s) to "admin"`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const u of TEST_USERS) {
    const email = u.email.toLowerCase();
    await col.updateOne(
      { email },
      {
        $set: { name: u.name, role: u.role, passwordHash },
        $setOnInsert: { email, createdAt: new Date() },
      },
      { upsert: true }
    );
    console.log(`✓ ${u.role.padEnd(8)} ${email}  (password: ${PASSWORD})`);
  }

  await client.close();
  console.log("\nDone. Log in at http://localhost:3000/login");
}

main().catch((e) => { console.error(e); process.exit(1); });
