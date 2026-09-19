import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import type { Person, Roster, Rules, Settings, User, PasswordReset } from "./types";

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.local.example to .env.local and fill it in (see DEPLOY.md for Vercel setup)."
    );
  }
  return uri;
}

function getDbName(): string {
  return process.env.MONGODB_DB || "ecf_roster";
}

// Reuse the client across hot reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __ecfMongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __ecfMongoPromise: Promise<MongoClient> | undefined;
}

async function getClient(): Promise<MongoClient> {
  if (global.__ecfMongoClient) return global.__ecfMongoClient;
  if (!global.__ecfMongoPromise) {
    const client = new MongoClient(getUri(), {
      // NOTE: we do not enable strict server API mode here — it makes the TS
      // driver typings reject plain-string filter values for _id. With it off,
      // the typed collections below accept both ObjectId and string.
      serverApi: { version: "1" as const, deprecationErrors: true },
    });
    global.__ecfMongoPromise = client.connect();
  }
  global.__ecfMongoClient = await global.__ecfMongoPromise;
  return global.__ecfMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(getDbName());
  return db;
}

// Convenience accessors with the right collection names. Each collection is
// typed to its document shape so callers don't need `as` casts. `_id` is
// modeled as `ObjectId | string` so that both pass the filter typings.
type WithId<T> = T & { _id: ObjectId | string };

// Convenience accessors with the right collection names.
export const collections = {
  users: () => getDb().then((db) => db.collection<WithId<User>>("users") as unknown as Collection<User>),
  people: () => getDb().then((db) => db.collection<WithId<Person>>("people") as unknown as Collection<Person>),
  rules: () => getDb().then((db) => db.collection<WithId<Rules>>("rules") as unknown as Collection<Rules>),
  rosters: () => getDb().then((db) => db.collection<WithId<Roster>>("rosters") as unknown as Collection<Roster>),
  settings: () => getDb().then((db) => db.collection<WithId<Settings>>("settings") as unknown as Collection<Settings>),
  passwordResets: () =>
    getDb().then((db) => db.collection<WithId<PasswordReset>>("password_resets") as unknown as Collection<PasswordReset>),
};

export function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}
