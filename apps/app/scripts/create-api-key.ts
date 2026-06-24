import { Database } from "bun:sqlite";
import { getDbPath } from "../src/lib/paths.js";
import { createStoredApiKey } from "./api-key-store";

const name = process.argv[2] || "install";
const dbPath = getDbPath();
const jwtSecret = process.env.FROST_JWT_SECRET;

if (!jwtSecret) {
  console.error("FROST_JWT_SECRET is required");
  process.exit(1);
}

const db = new Database(dbPath);
const key = createStoredApiKey(db, name, jwtSecret);
db.close();

console.log(key);
