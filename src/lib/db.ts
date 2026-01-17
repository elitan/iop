import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CamelCasePlugin, CompiledQuery, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DB } from "./db-types";

const DB_PATH = join(process.cwd(), "data", "frost.db");

if (!existsSync(join(process.cwd(), "data"))) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
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
