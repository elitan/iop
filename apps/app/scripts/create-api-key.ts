import { Database } from "bun:sqlite";
import { createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";
import { nanoid } from "nanoid";

const name = process.argv[2] || "install";

function getDbPath(): string {
  if (process.env.FROST_DB_PATH) {
    return process.env.FROST_DB_PATH;
  }
  if (process.env.FROST_DATA_DIR) {
    return join(process.env.FROST_DATA_DIR, "frost.db");
  }
  return "./data/frost.db";
}

const dbPath = getDbPath();
const jwtSecret = process.env.FROST_JWT_SECRET;

if (!jwtSecret) {
  console.error("FROST_JWT_SECRET is required");
  process.exit(1);
}

const db = new Database(dbPath);

function generateApiKey(): string {
  return `frost_${randomBytes(16).toString("hex")}`;
}

function hashApiKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

const id = nanoid();
const key = generateApiKey();
const keyHash = hashApiKey(key, jwtSecret);
const keyPrefix = key.slice(0, 12);

db.prepare(
  `INSERT INTO api_keys (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)`,
).run(id, name, keyPrefix, keyHash);

console.log(key);
