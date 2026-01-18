import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CamelCasePlugin, CompiledQuery, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DB } from "./db-types.js";
import { getDbPath } from "./paths";

const DB_PATH = getDbPath();
const DATA_DIR = dirname(DB_PATH);

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Kysely<DB>({
  dialect: new BunSqliteDialect({
    url: DB_PATH,
    onCreateConnection: async (conn) => {
      await conn.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL"));
      await conn.executeQuery(CompiledQuery.raw("PRAGMA busy_timeout = 5000"));
      await conn.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = ON"));
    },
  }),
  plugins: [new CamelCasePlugin()],
});
