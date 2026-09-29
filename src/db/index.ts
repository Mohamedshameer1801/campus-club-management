import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Either the root database or a transaction handle. */
export type DBLike = DB | Tx;

export function resolveDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "campus.db");
}

/** Opens a SQLite file with the mandatory pragmas (foreign keys are enforced on EVERY connection). */
export function openDatabase(file: string) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function runMigrations(db: DB) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

type Holder = { db: DB; sqlite: Database.Database };
const g = globalThis as typeof globalThis & { __campusDb?: Holder };

/** Lazily opens (and migrates) the application database. Safe to call on every request. */
export function getDb(): DB {
  if (!g.__campusDb) {
    const opened = openDatabase(resolveDbPath());
    runMigrations(opened.db);
    g.__campusDb = opened;
    if (process.env.AUTO_SEED_DEMO === "true") {
      const hasUsers = opened.sqlite.prepare("select count(*) as c from users").get() as { c: number };
      if (hasUsers.c === 0) seedDatabase(opened.db);
    }
  }
  return g.__campusDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  return (g.__campusDb as Holder).sqlite;
}
