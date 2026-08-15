import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compactSqliteDatabase } from "./sqlite-maintenance";

const TEST_DIR = join(process.cwd(), "test-sqlite-maintenance-tmp");
const TEST_DB = join(TEST_DIR, "test.db");

function createFreePages(): number {
  const sqlite = new Database(TEST_DB);
  sqlite.exec(`
    CREATE TABLE events (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
    BEGIN;
  `);
  const insert = sqlite.prepare("INSERT INTO events (payload) VALUES (?)");

  for (let index = 0; index < 2_000; index += 1) {
    insert.run("x".repeat(1_024));
  }

  sqlite.exec("COMMIT; DELETE FROM events;");
  const freePages = (
    sqlite.query("PRAGMA freelist_count").get() as {
      freelist_count: number;
    }
  ).freelist_count;
  sqlite.close();
  return freePages;
}

describe("compactSqliteDatabase", function describeCompaction() {
  beforeEach(function setup() {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(function cleanup() {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("vacuum reclaims a large freelist", function testVacuum() {
    expect(createFreePages()).toBeGreaterThan(0);

    const reclaimed = compactSqliteDatabase({
      dbPath: TEST_DB,
      minFreeBytes: 1,
      minFreeRatio: 0,
    });
    const sqlite = new Database(TEST_DB, { readonly: true });
    const freePages = (
      sqlite.query("PRAGMA freelist_count").get() as {
        freelist_count: number;
      }
    ).freelist_count;
    sqlite.close();

    expect(reclaimed).toBeGreaterThan(0);
    expect(freePages).toBe(0);
  });

  test("skips small freelists", function testSkip() {
    createFreePages();

    const reclaimed = compactSqliteDatabase({
      dbPath: TEST_DB,
      minFreeBytes: Number.MAX_SAFE_INTEGER,
      minFreeRatio: 0,
    });

    expect(reclaimed).toBe(0);
  });
});
