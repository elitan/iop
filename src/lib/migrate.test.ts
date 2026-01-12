import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "./migrate";

const TEST_DIR = join(process.cwd(), "test-migrate-tmp");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_SCHEMA_DIR = join(TEST_DIR, "schema");

describe("runMigrations", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_SCHEMA_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("creates database and applies migrations on fresh install", () => {
    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
    );
    writeFileSync(
      join(TEST_SCHEMA_DIR, "002-posts.sql"),
      "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);",
    );

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });

    expect(result.applied).toBe(2);
    expect(result.bootstrapped).toBe(false);

    const db = new Database(TEST_DB);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    db.close();

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("posts");
    expect(tableNames).toContain("_migrations");
  });

  test("skips already applied migrations", () => {
    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );

    const first = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });
    expect(first.applied).toBe(1);

    const second = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });
    expect(second.applied).toBe(0);
    expect(second.bootstrapped).toBe(false);
  });

  test("applies new migrations incrementally", () => {
    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );

    const first = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });
    expect(first.applied).toBe(1);

    writeFileSync(
      join(TEST_SCHEMA_DIR, "002-posts.sql"),
      "CREATE TABLE posts (id INTEGER PRIMARY KEY);",
    );

    const second = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });
    expect(second.applied).toBe(1);

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations ORDER BY name")
      .all() as Array<{
      name: string;
    }>;
    db.close();

    expect(migrations).toHaveLength(2);
    expect(migrations[0].name).toBe("001-init.sql");
    expect(migrations[1].name).toBe("002-posts.sql");
  });

  test("bootstraps existing database without migration tracking", () => {
    const db = new Database(TEST_DB);
    db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY)");
    db.close();

    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE projects (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(
      join(TEST_SCHEMA_DIR, "002-extra.sql"),
      "CREATE TABLE extra (id INTEGER PRIMARY KEY);",
    );

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });

    expect(result.applied).toBe(0);
    expect(result.bootstrapped).toBe(true);

    const db2 = new Database(TEST_DB);
    const migrations = db2
      .prepare("SELECT name FROM _migrations ORDER BY name")
      .all() as Array<{
      name: string;
    }>;
    db2.close();

    expect(migrations).toHaveLength(2);
    expect(migrations[0].name).toBe("001-init.sql");
    expect(migrations[1].name).toBe("002-extra.sql");
  });

  test("returns zero when no schema directory exists", () => {
    rmSync(TEST_SCHEMA_DIR, { recursive: true });

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });

    expect(result.applied).toBe(0);
    expect(result.bootstrapped).toBe(false);
  });

  test("rolls back failed migration", () => {
    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(
      join(TEST_SCHEMA_DIR, "002-bad.sql"),
      "THIS IS NOT VALID SQL;",
    );

    expect(() => {
      runMigrations({ dbPath: TEST_DB, schemaDir: TEST_SCHEMA_DIR });
    }).toThrow();

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations")
      .all() as Array<{
      name: string;
    }>;
    db.close();

    expect(migrations).toHaveLength(1);
    expect(migrations[0].name).toBe("001-init.sql");
  });

  test("migrations are applied in sorted order", () => {
    writeFileSync(
      join(TEST_SCHEMA_DIR, "003-third.sql"),
      "CREATE TABLE third (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-first.sql"),
      "CREATE TABLE first (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(
      join(TEST_SCHEMA_DIR, "002-second.sql"),
      "CREATE TABLE second (id INTEGER PRIMARY KEY);",
    );

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: TEST_SCHEMA_DIR,
    });
    expect(result.applied).toBe(3);

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations ORDER BY id")
      .all() as Array<{ name: string }>;
    db.close();

    expect(migrations[0].name).toBe("001-first.sql");
    expect(migrations[1].name).toBe("002-second.sql");
    expect(migrations[2].name).toBe("003-third.sql");
  });

  test("creates data directory if it does not exist", () => {
    const nestedDb = join(TEST_DIR, "nested", "deep", "test.db");

    writeFileSync(
      join(TEST_SCHEMA_DIR, "001-init.sql"),
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );

    const result = runMigrations({
      dbPath: nestedDb,
      schemaDir: TEST_SCHEMA_DIR,
    });

    expect(result.applied).toBe(1);
    expect(existsSync(nestedDb)).toBe(true);
  });
});
