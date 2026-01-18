import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runMigrations } from "./migrate";

const TEST_DIR = join(process.cwd(), "test-migrate-integration-tmp");
const TEST_DB = join(TEST_DIR, "test.db");
const PROD_SCHEMA_DIR = join(process.cwd(), "schema");
const MIGRATION_COUNT = readdirSync(PROD_SCHEMA_DIR).filter((f) =>
  f.endsWith(".sql"),
).length;

describe("migrate integration", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("all production migrations apply cleanly to fresh database", () => {
    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: PROD_SCHEMA_DIR,
    });

    expect(result.applied).toBe(MIGRATION_COUNT);
    expect(result.bootstrapped).toBe(false);
  });

  test("all expected tables exist after migrations", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    db.close();

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("_migrations");
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("services");
    expect(tableNames).toContain("deployments");
    expect(tableNames).toContain("domains");
    expect(tableNames).toContain("settings");
    expect(tableNames).toContain("github_installations");
    expect(tableNames).toContain("metrics");
    expect(tableNames).toContain("api_keys");
    expect(tableNames).toContain("registries");
  });

  test("projects table has expected columns", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    db.close();

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("env_vars");
    expect(columnNames).toContain("created_at");
  });

  test("services table has expected columns", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const columns = db.prepare("PRAGMA table_info(services)").all() as Array<{
      name: string;
      type: string;
    }>;
    db.close();

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("project_id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("deploy_type");
    expect(columnNames).toContain("repo_url");
    expect(columnNames).toContain("branch");
    expect(columnNames).toContain("dockerfile_path");
    expect(columnNames).toContain("build_context");
    expect(columnNames).toContain("image_url");
    expect(columnNames).toContain("env_vars");
    expect(columnNames).toContain("container_port");
    expect(columnNames).toContain("health_check_path");
    expect(columnNames).toContain("health_check_timeout");
    expect(columnNames).toContain("auto_deploy");
    expect(columnNames).toContain("service_type");
    expect(columnNames).toContain("volumes");
    expect(columnNames).toContain("tcp_proxy_port");
    expect(columnNames).toContain("current_deployment_id");
    expect(columnNames).toContain("memory_limit");
    expect(columnNames).toContain("cpu_limit");
    expect(columnNames).toContain("shutdown_timeout");
    expect(columnNames).toContain("request_timeout");
    expect(columnNames).toContain("registry_id");
  });

  test("deployments table has expected columns", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const columns = db
      .prepare("PRAGMA table_info(deployments)")
      .all() as Array<{
      name: string;
    }>;
    db.close();

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("project_id");
    expect(columnNames).toContain("service_id");
    expect(columnNames).toContain("commit_sha");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("container_id");
    expect(columnNames).toContain("host_port");
    expect(columnNames).toContain("build_log");
    expect(columnNames).toContain("image_name");
    expect(columnNames).toContain("env_vars_snapshot");
    expect(columnNames).toContain("rollback_eligible");
    expect(columnNames).toContain("git_commit_sha");
    expect(columnNames).toContain("git_branch");
  });

  test("domains table has expected columns", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const columns = db.prepare("PRAGMA table_info(domains)").all() as Array<{
      name: string;
    }>;
    db.close();

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("service_id");
    expect(columnNames).toContain("domain");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("redirect_target");
    expect(columnNames).toContain("redirect_code");
    expect(columnNames).toContain("dns_verified");
    expect(columnNames).toContain("ssl_status");
    expect(columnNames).toContain("is_system");
  });

  test("foreign key constraints are enabled and work", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    db.exec("PRAGMA foreign_keys = ON");

    const projectId = "test-project-123";
    db.prepare(
      "INSERT INTO projects (id, name, env_vars, created_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, "Test Project", "{}", Date.now());

    const serviceId = "test-service-456";
    db.prepare(
      "INSERT INTO services (id, project_id, name, deploy_type, env_vars, created_at, service_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(serviceId, projectId, "test-svc", "repo", "{}", Date.now(), "web");

    expect(() => {
      db.prepare(
        "INSERT INTO services (id, project_id, name, deploy_type, env_vars, created_at, service_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "orphan-service",
        "non-existent-project",
        "orphan",
        "repo",
        "{}",
        Date.now(),
        "web",
      );
    }).toThrow();

    db.close();
  });

  test("cascade delete works for services when project is deleted", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    db.exec("PRAGMA foreign_keys = ON");

    const projectId = "cascade-test-project";
    db.prepare(
      "INSERT INTO projects (id, name, env_vars, created_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, "Cascade Test", "{}", Date.now());

    db.prepare(
      "INSERT INTO services (id, project_id, name, deploy_type, env_vars, created_at, service_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("svc-1", projectId, "svc1", "repo", "{}", Date.now(), "web");

    db.prepare(
      "INSERT INTO services (id, project_id, name, deploy_type, env_vars, created_at, service_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("svc-2", projectId, "svc2", "image", "{}", Date.now(), "web");

    let services = db
      .prepare("SELECT id FROM services WHERE project_id = ?")
      .all(projectId) as Array<{ id: string }>;
    expect(services).toHaveLength(2);

    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    services = db
      .prepare("SELECT id FROM services WHERE project_id = ?")
      .all(projectId) as Array<{ id: string }>;
    expect(services).toHaveLength(0);

    db.close();
  });

  test("running migrations twice is safe (idempotent)", () => {
    const first = runMigrations({
      dbPath: TEST_DB,
      schemaDir: PROD_SCHEMA_DIR,
    });
    expect(first.applied).toBe(MIGRATION_COUNT);

    const second = runMigrations({
      dbPath: TEST_DB,
      schemaDir: PROD_SCHEMA_DIR,
    });
    expect(second.applied).toBe(0);
    expect(second.bootstrapped).toBe(false);

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations ORDER BY name")
      .all() as Array<{ name: string }>;
    db.close();

    expect(migrations).toHaveLength(MIGRATION_COUNT);
  });

  test("running migrations three times remains stable", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });
    const third = runMigrations({
      dbPath: TEST_DB,
      schemaDir: PROD_SCHEMA_DIR,
    });

    expect(third.applied).toBe(0);

    const db = new Database(TEST_DB);
    const count = db
      .prepare("SELECT COUNT(*) as count FROM _migrations")
      .get() as { count: number };
    db.close();

    expect(count.count).toBe(MIGRATION_COUNT);
  });

  test("migration tracking records correct timestamps", () => {
    const before = Date.now();
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });
    const after = Date.now();

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name, applied_at FROM _migrations ORDER BY id")
      .all() as Array<{ name: string; applied_at: number }>;
    db.close();

    for (const m of migrations) {
      expect(m.applied_at).toBeGreaterThanOrEqual(before);
      expect(m.applied_at).toBeLessThanOrEqual(after);
    }
  });

  test("migrations are recorded in correct order", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations ORDER BY id")
      .all() as Array<{ name: string }>;
    db.close();

    expect(migrations[0].name).toBe("001-init.sql");
    expect(migrations[1].name).toBe("002-env-vars.sql");
    expect(migrations[22].name).toBe("023-build-context.sql");

    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].name > migrations[i - 1].name).toBe(true);
    }
  });

  test("database can insert and query data after migrations", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);

    const projectId = "query-test-project";
    db.prepare(
      "INSERT INTO projects (id, name, env_vars, created_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, "Query Test", '{"FOO":"bar"}', Date.now());

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as {
      id: string;
      name: string;
      env_vars: string;
    };

    expect(project.id).toBe(projectId);
    expect(project.name).toBe("Query Test");
    expect(project.env_vars).toBe('{"FOO":"bar"}');

    db.close();
  });

  test("settings table works correctly", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);

    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "domain",
      "example.com",
    );

    const setting = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("domain") as { value: string };

    expect(setting.value).toBe("example.com");

    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
      "newdomain.com",
      "domain",
    );

    const updated = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("domain") as { value: string };

    expect(updated.value).toBe("newdomain.com");

    db.close();
  });

  test("metrics table can store time-series data", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      db.prepare(
        "INSERT INTO metrics (timestamp, type, cpu_percent, memory_percent) VALUES (?, ?, ?, ?)",
      ).run(now + i * 1000, "container", 50 + i, 60 + i);
    }

    const metrics = db
      .prepare("SELECT * FROM metrics ORDER BY timestamp")
      .all() as Array<{
      timestamp: number;
      cpu_percent: number;
      memory_percent: number;
    }>;

    expect(metrics).toHaveLength(5);
    expect(metrics[0].cpu_percent).toBe(50);
    expect(metrics[4].cpu_percent).toBe(54);

    db.close();
  });

  test("api_keys table has proper structure", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);

    db.prepare(
      "INSERT INTO api_keys (id, name, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("key-1", "Test Key", "frost_", "hash123", new Date().toISOString());

    const key = db
      .prepare("SELECT * FROM api_keys WHERE id = ?")
      .get("key-1") as {
      id: string;
      name: string;
      key_prefix: string;
      key_hash: string;
    };

    expect(key.name).toBe("Test Key");
    expect(key.key_prefix).toBe("frost_");

    db.close();
  });

  test("WAL mode is enabled after migrations", () => {
    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db = new Database(TEST_DB);
    const result = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    db.close();

    expect(result.journal_mode).toBe("wal");
  });

  test("concurrent migration calls are safe", async () => {
    const results = await Promise.all([
      new Promise<{ applied: number; bootstrapped: boolean }>((resolve) => {
        setTimeout(() => {
          resolve(
            runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR }),
          );
        }, 0);
      }),
      new Promise<{ applied: number; bootstrapped: boolean }>((resolve) => {
        setTimeout(() => {
          resolve(
            runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR }),
          );
        }, 5);
      }),
      new Promise<{ applied: number; bootstrapped: boolean }>((resolve) => {
        setTimeout(() => {
          resolve(
            runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR }),
          );
        }, 10);
      }),
    ]);

    const totalApplied = results.reduce((sum, r) => sum + r.applied, 0);
    expect(totalApplied).toBe(MIGRATION_COUNT);

    const db = new Database(TEST_DB);
    const count = db
      .prepare("SELECT COUNT(*) as count FROM _migrations")
      .get() as { count: number };
    db.close();

    expect(count.count).toBe(MIGRATION_COUNT);
  });
});

describe("migrate bootstrap scenarios", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("bootstraps database with existing projects table", () => {
    const db = new Database(TEST_DB);
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        env_vars TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )
    `);
    db.exec(
      "INSERT INTO projects (id, name, created_at) VALUES ('p1', 'Test', 123)",
    );
    db.close();

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: PROD_SCHEMA_DIR,
    });

    expect(result.bootstrapped).toBe(true);
    expect(result.applied).toBe(0);

    const db2 = new Database(TEST_DB);
    const migrations = db2
      .prepare("SELECT name FROM _migrations")
      .all() as Array<{ name: string }>;
    db2.close();

    expect(migrations).toHaveLength(MIGRATION_COUNT);
  });

  test("bootstrap preserves existing data", () => {
    const db = new Database(TEST_DB);
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        env_vars TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )
    `);
    db.exec(
      "INSERT INTO projects (id, name, created_at) VALUES ('existing-project', 'Preserved', 999)",
    );
    db.close();

    runMigrations({ dbPath: TEST_DB, schemaDir: PROD_SCHEMA_DIR });

    const db2 = new Database(TEST_DB);
    const project = db2
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get("existing-project") as { id: string; name: string };
    db2.close();

    expect(project).toBeDefined();
    expect(project.name).toBe("Preserved");
  });

  test("new migrations apply after bootstrap on next run", () => {
    const testSchemaDir = join(TEST_DIR, "schema");
    mkdirSync(testSchemaDir);

    writeFileSync(
      join(testSchemaDir, "001-init.sql"),
      "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);",
    );

    const db = new Database(TEST_DB);
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)");
    db.close();

    const bootstrap = runMigrations({
      dbPath: TEST_DB,
      schemaDir: testSchemaDir,
    });
    expect(bootstrap.bootstrapped).toBe(true);

    writeFileSync(
      join(testSchemaDir, "002-new.sql"),
      "CREATE TABLE new_table (id TEXT PRIMARY KEY);",
    );

    const second = runMigrations({ dbPath: TEST_DB, schemaDir: testSchemaDir });
    expect(second.applied).toBe(1);
    expect(second.bootstrapped).toBe(false);

    const db2 = new Database(TEST_DB);
    const tables = db2
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='new_table'",
      )
      .get();
    db2.close();

    expect(tables).toBeDefined();
  });
});

describe("migrate edge cases", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("handles empty schema directory", () => {
    const emptySchemaDir = join(TEST_DIR, "empty-schema");
    mkdirSync(emptySchemaDir);

    const result = runMigrations({
      dbPath: TEST_DB,
      schemaDir: emptySchemaDir,
    });

    expect(result.applied).toBe(0);
    expect(result.bootstrapped).toBe(false);
  });

  test("ignores non-sql files in schema directory", () => {
    const schemaDir = join(TEST_DIR, "schema");
    mkdirSync(schemaDir);

    writeFileSync(
      join(schemaDir, "001-init.sql"),
      "CREATE TABLE test (id INTEGER);",
    );
    writeFileSync(join(schemaDir, "README.md"), "# Migrations");
    writeFileSync(join(schemaDir, ".gitkeep"), "");
    writeFileSync(
      join(schemaDir, "002-test.sql.bak"),
      "CREATE TABLE backup (id INTEGER);",
    );

    const result = runMigrations({ dbPath: TEST_DB, schemaDir });

    expect(result.applied).toBe(1);

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations")
      .all() as Array<{ name: string }>;
    db.close();

    expect(migrations).toHaveLength(1);
    expect(migrations[0].name).toBe("001-init.sql");
  });

  test("handles migration with multiple statements", () => {
    const schemaDir = join(TEST_DIR, "schema");
    mkdirSync(schemaDir);

    writeFileSync(
      join(schemaDir, "001-multi.sql"),
      `
      CREATE TABLE a (id INTEGER PRIMARY KEY);
      CREATE TABLE b (id INTEGER PRIMARY KEY);
      CREATE TABLE c (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));
      CREATE INDEX idx_c_a ON c(a_id);
      `,
    );

    const result = runMigrations({ dbPath: TEST_DB, schemaDir });
    expect(result.applied).toBe(1);

    const db = new Database(TEST_DB);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    db.close();

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("a");
    expect(tableNames).toContain("b");
    expect(tableNames).toContain("c");
  });

  test("partial failure does not corrupt migration state", () => {
    const schemaDir = join(TEST_DIR, "schema");
    mkdirSync(schemaDir);

    writeFileSync(
      join(schemaDir, "001-good.sql"),
      "CREATE TABLE good (id INTEGER);",
    );
    writeFileSync(
      join(schemaDir, "002-bad.sql"),
      "CREATE TABLE bad (id INTEGER); INVALID SQL HERE;",
    );
    writeFileSync(
      join(schemaDir, "003-never.sql"),
      "CREATE TABLE never (id INTEGER);",
    );

    expect(() => runMigrations({ dbPath: TEST_DB, schemaDir })).toThrow();

    const db = new Database(TEST_DB);
    const migrations = db
      .prepare("SELECT name FROM _migrations")
      .all() as Array<{ name: string }>;
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations'",
      )
      .all() as Array<{ name: string }>;
    db.close();

    expect(migrations).toHaveLength(1);
    expect(migrations[0].name).toBe("001-good.sql");

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("good");
    expect(tableNames).not.toContain("bad");
    expect(tableNames).not.toContain("never");
  });

  test("can resume after fixing failed migration", () => {
    const schemaDir = join(TEST_DIR, "schema");
    mkdirSync(schemaDir);

    writeFileSync(
      join(schemaDir, "001-good.sql"),
      "CREATE TABLE good (id INTEGER);",
    );
    writeFileSync(join(schemaDir, "002-bad.sql"), "INVALID SQL;");

    expect(() => runMigrations({ dbPath: TEST_DB, schemaDir })).toThrow();

    writeFileSync(
      join(schemaDir, "002-bad.sql"),
      "CREATE TABLE fixed (id INTEGER);",
    );

    const result = runMigrations({ dbPath: TEST_DB, schemaDir });
    expect(result.applied).toBe(1);

    const db = new Database(TEST_DB);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    db.close();

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("good");
    expect(tableNames).toContain("fixed");
  });
});
