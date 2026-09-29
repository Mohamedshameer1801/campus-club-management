import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test file gets its own isolated SQLite database file (never the development database).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "campus-test-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.BCRYPT_ROUNDS = "4";
process.env.AUTO_SEED_DEMO = "false";
process.env.DEMO_PASSWORD = "Password123!";
delete process.env.COOKIE_SECURE;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.APP_URL;
delete process.env.TRUSTED_ORIGINS;
