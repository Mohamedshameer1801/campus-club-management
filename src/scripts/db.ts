import "dotenv/config";
import fs from "node:fs";
import { openDatabase, resolveDbPath, runMigrations } from "../db";
import { seedDatabase } from "../db/seed";

// Usage: tsx src/scripts/db.ts <migrate|seed|reset>
const cmd = process.argv[2] ?? "migrate";
const file = resolveDbPath();

if (cmd === "reset") {
  for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(file + suffix)) fs.rmSync(file + suffix);
  console.log(`Removed ${file}`);
}
const { db, sqlite } = openDatabase(file);
runMigrations(db);
console.log(`Migrations applied to ${file} (foreign_keys=${sqlite.pragma("foreign_keys", { simple: true })})`);
if (cmd === "seed" || cmd === "reset") console.log(seedDatabase(db).message);
sqlite.close();
