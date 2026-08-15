import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CamelCasePlugin, CompiledQuery, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import { claimCleanupJob, isCleanupLockStale } from "./cleanup";
import type { DB } from "./db-types";
import { runMigrations } from "./migrate";

const TEST_DIR = join(process.cwd(), "test-cleanup-lock-tmp");
const TEST_DB = join(TEST_DIR, "test.db");

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new BunSqliteDialect({
      url: TEST_DB,
      onCreateConnection: async function configureConnection(conn) {
        await conn.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL"));
        await conn.executeQuery(
          CompiledQuery.raw("PRAGMA busy_timeout = 5000"),
        );
      },
    }),
    plugins: [new CamelCasePlugin()],
  });
}

describe("cleanup lock", function describeCleanupLock() {
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

  test("claims an unlocked cleanup job once", async function testClaim() {
    const database = createTestDb();
    const now = new Date("2026-08-15T12:00:00.000Z");

    try {
      const firstClaim = await claimCleanupJob(database, now);
      const secondClaim = await claimCleanupJob(database, now);

      expect(firstClaim).not.toBeNull();
      expect(secondClaim).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  test("reclaims a lock left by a dead process", async function testStaleLock() {
    const database = createTestDb();

    try {
      await database
        .insertInto("settings")
        .values([
          { key: "cleanup_running", value: "true" },
          {
            key: "cleanup_started_at",
            value: "2026-08-15T01:00:00.000Z",
          },
        ])
        .execute();

      const claim = await claimCleanupJob(
        database,
        new Date("2026-08-15T12:00:00.000Z"),
      );

      expect(claim).not.toBeNull();
    } finally {
      await database.destroy();
    }
  });

  test("treats a legacy boolean lock as stale", function testLegacyLock() {
    expect(
      isCleanupLockStale(true, null, new Date("2026-08-15T12:00:00.000Z")),
    ).toBe(true);
  });
});
