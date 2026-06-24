import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDbPath } from "../src/lib/paths.js";
import { CLEANUP_API_KEY_NAME } from "../src/lib/system-api-keys.js";
import {
  createStoredApiKey,
  deleteApiKeysByName,
  hasStoredApiKey,
} from "./api-key-store";

const API_KEY_PATTERN = /^frost_[a-f0-9]{32}$/;
const jwtSecret = process.env.FROST_JWT_SECRET;

if (!jwtSecret) {
  console.error("FROST_JWT_SECRET is required");
  process.exit(1);
}

const keyFile =
  process.env.FROST_CLEANUP_API_KEY_FILE ??
  join(getDataDir(), ".cleanup-api-key");
const db = new Database(getDbPath());

function readExistingKey(): string | null {
  if (!existsSync(keyFile)) return null;

  const value = readFileSync(keyFile, "utf8").trim();
  if (!API_KEY_PATTERN.test(value)) return null;
  return value;
}

function writeCleanupKey(key: string): void {
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, `${key}\n`, { mode: 0o600 });
  chmodSync(keyFile, 0o600);
}

const existingKey = readExistingKey();
if (existingKey && hasStoredApiKey(db, existingKey, jwtSecret)) {
  chmodSync(keyFile, 0o600);
  db.close();
  console.error("Cleanup API key ready");
  process.exit(0);
}

deleteApiKeysByName(db, CLEANUP_API_KEY_NAME);
const key = createStoredApiKey(db, CLEANUP_API_KEY_NAME, jwtSecret);
writeCleanupKey(key);
db.close();

console.error("Cleanup API key created");
