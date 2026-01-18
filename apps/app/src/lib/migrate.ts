import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDbPath } from "./paths";

export interface MigrationResult {
  applied: number;
  bootstrapped: boolean;
}

export interface MigrationOptions {
  dbPath?: string;
  schemaDir?: string;
}

export function runMigrations(options?: MigrationOptions): MigrationResult {
  const dbPath = options?.dbPath ?? getDbPath();
  const schemaDir = options?.schemaDir ?? join(process.cwd(), "schema");

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  if (!existsSync(schemaDir)) {
    console.log("[migrate] No schema directory found");
    return { applied: 0, bootstrapped: false };
  }

  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  try {
    return runMigrationsWithDb(sqlite, schemaDir);
  } finally {
    sqlite.close();
  }
}

function runMigrationsWithDb(
  sqlite: Database,
  schemaDir: string,
): MigrationResult {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrationFiles = readdirSync(schemaDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = sqlite
    .prepare("SELECT name FROM _migrations")
    .all() as Array<{
    name: string;
  }>;
  const appliedSet = new Set(applied.map((r) => r.name));

  const hasExistingDb = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
    )
    .get();

  if (hasExistingDb && appliedSet.size === 0) {
    const now = Date.now();
    const insert = sqlite.prepare(
      "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
    );
    for (const file of migrationFiles) {
      insert.run(file, now);
    }
    console.log(
      `[migrate] Bootstrapped ${migrationFiles.length} existing migrations`,
    );
    return { applied: 0, bootstrapped: true };
  }

  let appliedCount = 0;
  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = join(schemaDir, file);
    const sql = readFileSync(filePath, "utf-8");

    sqlite.exec("BEGIN EXCLUSIVE");
    try {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, Date.now());
      sqlite.exec("COMMIT");
      console.log(`[migrate] Applied: ${file}`);
      appliedCount++;
    } catch (err) {
      sqlite.exec("ROLLBACK");
      console.error(`[migrate] Failed to apply ${file}:`, err);
      throw err;
    }
  }

  if (appliedCount > 0) {
    console.log(`[migrate] Applied ${appliedCount} migration(s)`);
  } else if (appliedSet.size === 0) {
    console.log("[migrate] No migrations to apply");
  }

  return { applied: appliedCount, bootstrapped: false };
}
