import type { Database } from "bun:sqlite";
import { createHmac, randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const API_KEY_ID_SIZE = 20;
const generateApiKeyId = customAlphabet(ID_ALPHABET, API_KEY_ID_SIZE);

interface ApiKeyRow {
  id: string;
}

function newApiKeyId(): string {
  return `key_${generateApiKeyId()}`;
}

export function generateApiKey(): string {
  return `frost_${randomBytes(16).toString("hex")}`;
}

export function hashApiKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

export function hasStoredApiKey(
  db: Database,
  key: string,
  secret: string,
): boolean {
  const keyHash = hashApiKey(key, secret);
  const row = db
    .query<ApiKeyRow, [string]>(
      "SELECT id FROM api_keys WHERE key_hash = ? LIMIT 1",
    )
    .get(keyHash);
  return row !== null;
}

export function deleteApiKeysByName(db: Database, name: string): void {
  db.query<never, [string]>("DELETE FROM api_keys WHERE name = ?").run(name);
}

export function createStoredApiKey(
  db: Database,
  name: string,
  secret: string,
): string {
  const id = newApiKeyId();
  const key = generateApiKey();
  const keyHash = hashApiKey(key, secret);
  const keyPrefix = key.slice(0, 12);

  db.query<never, [string, string, string, string]>(
    "INSERT INTO api_keys (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)",
  ).run(id, name, keyPrefix, keyHash);

  return key;
}
