import { Database } from "bun:sqlite";
import { randomBytes, scrypt } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { getDbPath } from "../lib/paths";

const scryptAsync = promisify(scrypt);

const DB_PATH = getDbPath();
const DATA_DIR = dirname(DB_PATH);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function setup() {
  const password = process.argv[2];

  if (!password) {
    console.error("Usage: bun run setup <password>");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const hash = await hashPassword(password);

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    "admin_password_hash",
    hash,
  ]);

  const domain = process.env.FROST_DOMAIN;
  if (domain) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "domain",
      domain,
    ]);
  }

  const email = process.env.FROST_EMAIL;
  if (email) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "email",
      email,
    ]);
  }

  db.close();

  console.log("Setup complete. Admin password has been set.");
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
