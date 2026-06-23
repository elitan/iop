import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CamelCasePlugin, CompiledQuery, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DB } from "./db-types.js";
import { runMigrations } from "./migrate";
import { pruneOldMetricsFromDb } from "./monitoring";

const TEST_DIR = join(process.cwd(), "test-monitoring-tmp");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_ROW_COUNT = 700_000;

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new BunSqliteDialect({
      url: TEST_DB,
      onCreateConnection: async function onCreateConnection(conn) {
        await conn.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL"));
        await conn.executeQuery(
          CompiledQuery.raw("PRAGMA busy_timeout = 5000"),
        );
        await conn.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = ON"));
      },
    }),
    plugins: [new CamelCasePlugin()],
  });
}

function insertMetricsRows(count: number): void {
  const sqlite = new Database(TEST_DB);
  sqlite.exec("PRAGMA journal_mode = OFF");
  sqlite.exec("PRAGMA synchronous = OFF");
  sqlite.exec("BEGIN");

  const stmt = sqlite.prepare(
    "INSERT INTO metrics (timestamp, type, cpu_percent, memory_percent) VALUES (?, 'system', 1, 1)",
  );

  for (let i = 0; i < count; i += 1) {
    stmt.run(i);
  }

  sqlite.exec("COMMIT");
  sqlite.close();
}

describe("pruneOldMetricsFromDb", function describePruneOldMetrics() {
  beforeEach(function setup() {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    runMigrations({
      dbPath: TEST_DB,
      schemaDir: join(process.cwd(), "schema"),
    });
  });

  afterEach(function cleanup() {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("prunes large metric sets without binding every id", async function testPruneLargeMetricSet() {
    insertMetricsRows(TEST_ROW_COUNT);
    const testDb = createTestDb();

    try {
      const deleted = await pruneOldMetricsFromDb(testDb);
      const remaining = await testDb
        .selectFrom("metrics")
        .select(testDb.fn.count("id").as("count"))
        .executeTakeFirstOrThrow();

      expect(deleted).toBeGreaterThan(100_000);
      expect(Number(remaining.count)).toBe(TEST_ROW_COUNT - deleted);
    } finally {
      await testDb.destroy();
    }
  });
});
