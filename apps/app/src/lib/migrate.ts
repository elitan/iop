import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDbPath } from "./paths";

const alphabet =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

const migrationNamePattern = /^(\d{3})-[a-z0-9-]+\.sql$/;

const renamedMigrationAliases = [
  {
    oldName: "015-database-backup-config.sql",
    newName: "016-database-backup-config.sql",
  },
  {
    oldName: "015-drop-project-canvas-positions.sql",
    newName: "017-drop-project-canvas-positions.sql",
  },
  {
    oldName: "016-prefixed-primary-keys.sql",
    newName: "018-prefixed-primary-keys.sql",
  },
  {
    oldName: "017-branch-ttl-scale-to-zero.sql",
    newName: "019-branch-ttl-scale-to-zero.sql",
  },
  {
    oldName: "018-database-import-jobs.sql",
    newName: "020-database-import-jobs.sql",
  },
  {
    oldName: "019-database-target-stopped-reason.sql",
    newName: "021-database-target-stopped-reason.sql",
  },
];

function generateId(size = 21): string {
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] & 63];
  }
  return id;
}

export interface MigrationResult {
  applied: number;
  bootstrapped: boolean;
  schemaUpgrades: string[];
}

export interface MigrationOptions {
  dbPath?: string;
  schemaDir?: string;
}

export function validateMigrationFiles(migrationFiles: string[]): void {
  const seenNumbers = new Map<number, string>();
  const filesByNumber = [...migrationFiles].sort(function compareFiles(a, b) {
    return getMigrationNumber(a) - getMigrationNumber(b);
  });

  for (let index = 0; index < filesByNumber.length; index++) {
    const file = filesByNumber[index];
    const number = getMigrationNumber(file);
    const existingFile = seenNumbers.get(number);

    if (existingFile) {
      throw new Error(
        `Duplicate migration number ${formatMigrationNumber(number)}: ${existingFile}, ${file}`,
      );
    }

    seenNumbers.set(number, file);

    const expectedNumber = index + 1;
    if (number !== expectedNumber) {
      throw new Error(
        `Out-of-order migration number ${file}: expected ${formatMigrationNumber(expectedNumber)}`,
      );
    }
  }

  for (let index = 0; index < migrationFiles.length; index++) {
    if (migrationFiles[index] !== filesByNumber[index]) {
      throw new Error(
        `Out-of-order migration file ${migrationFiles[index]}: expected ${filesByNumber[index]}`,
      );
    }
  }
}

export function getMigrationFiles(schemaDir: string): string[] {
  const migrationFiles = readdirSync(schemaDir)
    .filter(function isSqlFile(file) {
      return file.endsWith(".sql");
    })
    .sort();

  validateMigrationFiles(migrationFiles);
  return migrationFiles;
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
    return { applied: 0, bootstrapped: false, schemaUpgrades: [] };
  }

  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  try {
    const result = runMigrationsWithDb(sqlite, schemaDir);
    const schemaUpgrades = runSchemaUpgrades(sqlite);
    return { ...result, schemaUpgrades };
  } finally {
    sqlite.close();
  }
}

function getMigrationNumber(file: string): number {
  const match = file.match(migrationNamePattern);
  if (!match) {
    throw new Error(`Invalid migration filename: ${file}`);
  }

  return Number.parseInt(match[1], 10);
}

function formatMigrationNumber(number: number): string {
  return number.toString().padStart(3, "0");
}

function markRenamedMigrations(sqlite: Database): void {
  const applied = sqlite
    .prepare("SELECT name, applied_at FROM _migrations")
    .all() as Array<{
    name: string;
    applied_at: number;
  }>;
  const appliedMap = new Map<string, number>();

  for (const row of applied) {
    appliedMap.set(row.name, row.applied_at);
  }

  const insert = sqlite.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const alias of renamedMigrationAliases) {
    const appliedAt = appliedMap.get(alias.oldName);
    if (appliedAt === undefined || appliedMap.has(alias.newName)) {
      continue;
    }

    insert.run(alias.newName, appliedAt);
    appliedMap.set(alias.newName, appliedAt);
  }
}

function runMigrationsWithDb(
  sqlite: Database,
  schemaDir: string,
): Omit<MigrationResult, "schemaUpgrades"> {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrationFiles = getMigrationFiles(schemaDir);

  markRenamedMigrations(sqlite);

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
    const needsForeignKeysOff = sql.includes("PRAGMA foreign_keys = OFF");

    if (needsForeignKeysOff) {
      try {
        sqlite.exec(sql);
        sqlite
          .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
          .run(file, Date.now());
        console.log(`[migrate] Applied: ${file}`);
        appliedCount++;
      } catch (err) {
        try {
          sqlite.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("[migrate] Rollback failed:", rollbackError);
        }
        console.error(`[migrate] Failed to apply ${file}:`, err);
        throw err;
      }
      continue;
    }

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

function runSchemaUpgrades(sqlite: Database): string[] {
  const upgrades: string[] = [];

  const hasProjectsTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
    )
    .get();

  if (!hasProjectsTable) {
    return upgrades;
  }

  const hasCreatedAtColumn = (
    sqlite.prepare("PRAGMA table_info(projects)").all() as Array<{
      name: string;
    }>
  ).some((col) => col.name === "created_at");

  if (!hasCreatedAtColumn) {
    return upgrades;
  }

  const hasEnvironmentsTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='environments'",
    )
    .get();

  if (!hasEnvironmentsTable) {
    console.log("[migrate] Running schema upgrade: add environments support");
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec("BEGIN EXCLUSIVE");
    try {
      sqlite.exec(`
        CREATE TABLE environments (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('production', 'preview', 'manual')),
          pr_number INTEGER,
          pr_branch TEXT,
          is_ephemeral INTEGER DEFAULT 0 CHECK (is_ephemeral IN (0, 1)),
          created_at INTEGER NOT NULL,
          UNIQUE(project_id, name)
        )
      `);

      sqlite.exec(`
        CREATE INDEX idx_environments_project_id ON environments(project_id)
      `);

      sqlite.exec(`
        CREATE INDEX idx_environments_branch ON environments(project_id, pr_branch)
      `);

      const projects = sqlite
        .prepare("SELECT id, created_at FROM projects")
        .all() as Array<{ id: string; created_at: number }>;

      const insertEnv = sqlite.prepare(`
        INSERT INTO environments (id, project_id, name, type, is_ephemeral, created_at)
        VALUES (?, ?, 'production', 'production', 0, ?)
      `);

      for (const project of projects) {
        const envId = generateId();
        insertEnv.run(envId, project.id, project.created_at);
      }

      console.log(
        `[migrate] Created ${projects.length} default production environments`,
      );

      const hasServicesTable = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='services'",
        )
        .get();

      const hasProjectIdColumn =
        hasServicesTable &&
        (
          sqlite.prepare("PRAGMA table_info(services)").all() as Array<{
            name: string;
          }>
        ).some((col) => col.name === "project_id");

      if (hasProjectIdColumn) {
        console.log(
          "[migrate] Migrating services from project_id to environment_id",
        );

        sqlite.exec(`
          ALTER TABLE services RENAME TO services_old
        `);

        sqlite.exec(`
          CREATE TABLE services (
            id TEXT PRIMARY KEY,
            environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            hostname TEXT,
            deploy_type TEXT NOT NULL DEFAULT 'repo' CHECK (deploy_type IN ('repo', 'image')),
            service_type TEXT NOT NULL DEFAULT 'app' CHECK (service_type IN ('app', 'database')),
            repo_url TEXT,
            branch TEXT DEFAULT 'main',
            dockerfile_path TEXT DEFAULT 'Dockerfile',
            build_context TEXT,
            image_url TEXT,
            registry_id TEXT,
            env_vars TEXT NOT NULL DEFAULT '[]',
            container_port INTEGER DEFAULT 8080,
            health_check_path TEXT,
            health_check_timeout INTEGER DEFAULT 60,
            auto_deploy INTEGER DEFAULT 1 CHECK (auto_deploy IN (0, 1)),
            volumes TEXT DEFAULT '[]',
            tcp_proxy_port INTEGER,
            memory_limit TEXT,
            cpu_limit REAL,
            shutdown_timeout INTEGER,
            request_timeout INTEGER,
            command TEXT,
            current_deployment_id TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(environment_id, name)
          )
        `);

        sqlite.exec(`
          INSERT INTO services (
            id, environment_id, name, hostname, deploy_type, service_type,
            repo_url, branch, dockerfile_path, build_context, image_url, registry_id,
            env_vars, container_port, health_check_path, health_check_timeout,
            auto_deploy, volumes, tcp_proxy_port, memory_limit, cpu_limit,
            shutdown_timeout, request_timeout, command, current_deployment_id, created_at
          )
          SELECT
            s.id,
            e.id,
            s.name,
            s.hostname,
            s.deploy_type,
            COALESCE(s.service_type, 'app'),
            s.repo_url,
            s.branch,
            s.dockerfile_path,
            s.build_context,
            s.image_url,
            s.registry_id,
            s.env_vars,
            s.container_port,
            s.health_check_path,
            s.health_check_timeout,
            s.auto_deploy,
            COALESCE(s.volumes, '[]'),
            s.tcp_proxy_port,
            s.memory_limit,
            s.cpu_limit,
            s.shutdown_timeout,
            s.request_timeout,
            s.command,
            s.current_deployment_id,
            s.created_at
          FROM services_old s
          INNER JOIN environments e ON e.project_id = s.project_id AND e.type = 'production'
        `);

        sqlite.exec(`DROP TABLE services_old`);
        sqlite.exec(
          `CREATE INDEX idx_services_environment_id ON services(environment_id)`,
        );

        console.log("[migrate] Services migrated to use environment_id");
      }

      const hasDeploymentsTable = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='deployments'",
        )
        .get();

      const hasDeploymentsEnvColumn =
        hasDeploymentsTable &&
        (
          sqlite.prepare("PRAGMA table_info(deployments)").all() as Array<{
            name: string;
          }>
        ).some((col) => col.name === "environment_id");

      if (hasDeploymentsTable && !hasDeploymentsEnvColumn) {
        console.log("[migrate] Adding environment_id to deployments");

        sqlite.exec(`
          ALTER TABLE deployments RENAME TO deployments_old
        `);

        sqlite.exec(`
          CREATE TABLE deployments (
            id TEXT PRIMARY KEY,
            service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
            environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
            commit_sha TEXT NOT NULL,
            commit_message TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cloning', 'pulling', 'building', 'deploying', 'running', 'failed', 'stopped', 'cancelled')),
            container_id TEXT,
            host_port INTEGER,
            build_log TEXT,
            error_message TEXT,
            image_name TEXT,
            env_vars_snapshot TEXT,
            container_port INTEGER,
            health_check_path TEXT,
            health_check_timeout INTEGER,
            volumes TEXT,
            rollback_eligible INTEGER DEFAULT 0 CHECK (rollback_eligible IN (0, 1)),
            rollback_source_id TEXT,
            git_commit_sha TEXT,
            git_branch TEXT,
            created_at INTEGER NOT NULL,
            finished_at INTEGER
          )
        `);

        sqlite.exec(`
          INSERT INTO deployments (
            id, service_id, environment_id, commit_sha, commit_message, status,
            container_id, host_port, build_log, error_message, image_name,
            env_vars_snapshot, container_port, health_check_path, health_check_timeout,
            volumes, rollback_eligible, rollback_source_id, git_commit_sha, git_branch,
            created_at, finished_at
          )
          SELECT
            d.id,
            d.service_id,
            s.environment_id,
            d.commit_sha,
            d.commit_message,
            d.status,
            d.container_id,
            d.host_port,
            d.build_log,
            d.error_message,
            d.image_name,
            d.env_vars_snapshot,
            d.container_port,
            d.health_check_path,
            d.health_check_timeout,
            d.volumes,
            COALESCE(d.rollback_eligible, 0),
            d.rollback_source_id,
            d.git_commit_sha,
            d.git_branch,
            d.created_at,
            d.finished_at
          FROM deployments_old d
          INNER JOIN services s ON s.id = d.service_id
        `);

        sqlite.exec(`DROP TABLE deployments_old`);
        sqlite.exec(
          `CREATE INDEX idx_deployments_service_id ON deployments(service_id)`,
        );
        sqlite.exec(
          `CREATE INDEX idx_deployments_environment_id ON deployments(environment_id)`,
        );
        sqlite.exec(
          `CREATE INDEX idx_deployments_status ON deployments(status)`,
        );

        console.log("[migrate] Deployments migrated to use environment_id");
      }

      const hasDomainsTable = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='domains'",
        )
        .get();

      const hasDomainsEnvColumn =
        hasDomainsTable &&
        (
          sqlite.prepare("PRAGMA table_info(domains)").all() as Array<{
            name: string;
          }>
        ).some((col) => col.name === "environment_id");

      if (hasDomainsTable && !hasDomainsEnvColumn) {
        console.log("[migrate] Adding environment_id to domains");

        sqlite.exec(`
          ALTER TABLE domains RENAME TO domains_old
        `);

        sqlite.exec(`
          CREATE TABLE domains (
            id TEXT PRIMARY KEY,
            service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
            environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
            domain TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'proxy' CHECK (type IN ('proxy', 'redirect')),
            redirect_target TEXT,
            redirect_code INTEGER DEFAULT 301 CHECK (redirect_code IN (301, 307)),
            dns_verified INTEGER DEFAULT 0 CHECK (dns_verified IN (0, 1)),
            ssl_status TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
            is_system INTEGER DEFAULT 0 CHECK (is_system IN (0, 1)),
            created_at INTEGER NOT NULL,
            CHECK ((type = 'proxy' AND redirect_target IS NULL) OR (type = 'redirect' AND redirect_target IS NOT NULL))
          )
        `);

        sqlite.exec(`
          INSERT INTO domains (
            id, service_id, environment_id, domain, type, redirect_target,
            redirect_code, dns_verified, ssl_status, is_system, created_at
          )
          SELECT
            d.id,
            d.service_id,
            s.environment_id,
            d.domain,
            d.type,
            d.redirect_target,
            COALESCE(d.redirect_code, 301),
            COALESCE(d.dns_verified, 0),
            COALESCE(d.ssl_status, 'pending'),
            COALESCE(d.is_system, 0),
            d.created_at
          FROM domains_old d
          INNER JOIN services s ON s.id = d.service_id
        `);

        sqlite.exec(`DROP TABLE domains_old`);
        sqlite.exec(
          `CREATE INDEX idx_domains_service_id ON domains(service_id)`,
        );
        sqlite.exec(
          `CREATE INDEX idx_domains_environment_id ON domains(environment_id)`,
        );
        sqlite.exec(`CREATE INDEX idx_domains_domain ON domains(domain)`);

        console.log("[migrate] Domains migrated to use environment_id");
      }

      sqlite.exec("COMMIT");
      sqlite.exec("PRAGMA foreign_keys = ON");
      upgrades.push("environments");
      console.log("[migrate] Schema upgrade complete: environments support");
    } catch (err) {
      sqlite.exec("ROLLBACK");
      sqlite.exec("PRAGMA foreign_keys = ON");
      console.error("[migrate] Schema upgrade failed:", err);
      throw err;
    }
  }

  ensureObjectStorageSchema(sqlite, upgrades);

  return upgrades;
}

function hasTable(sqlite: Database, tableName: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName),
  );
}

function getTableSql(sqlite: Database, tableName: string): string {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { sql?: string } | undefined;
  return row?.sql ?? "";
}

function getTableColumns(sqlite: Database, tableName: string): Set<string> {
  const columns = sqlite
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{
    name: string;
  }>;
  return new Set(
    columns.map(function getName(column) {
      return column.name;
    }),
  );
}

function selectExistingColumn(
  columns: Set<string>,
  columnName: string,
  fallbackSql: string,
): string {
  return columns.has(columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function rebuildServicesForObjectStorage(sqlite: Database): void {
  const columns = getTableColumns(sqlite, "services");

  sqlite.exec(`
    DROP INDEX IF EXISTS idx_services_environment_id;
    DROP INDEX IF EXISTS idx_services_environment_hostname;

    CREATE TABLE services_new (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      hostname TEXT,
      deploy_type TEXT NOT NULL DEFAULT 'repo' CHECK (deploy_type IN ('repo', 'image')),
      service_type TEXT NOT NULL DEFAULT 'app' CHECK (service_type IN ('app', 'database', 'object-storage')),
      repo_url TEXT,
      branch TEXT DEFAULT 'main',
      dockerfile_path TEXT DEFAULT 'Dockerfile',
      build_context TEXT,
      image_url TEXT,
      registry_id TEXT,
      env_vars TEXT NOT NULL DEFAULT '[]',
      container_port INTEGER DEFAULT 8080,
      health_check_path TEXT,
      health_check_timeout INTEGER DEFAULT 60,
      auto_deploy INTEGER DEFAULT 1 CHECK (auto_deploy IN (0, 1)),
      volumes TEXT DEFAULT '[]',
      tcp_proxy_port INTEGER,
      memory_limit TEXT,
      cpu_limit REAL,
      shutdown_timeout INTEGER,
      drain_timeout INTEGER,
      request_timeout INTEGER,
      command TEXT,
      icon TEXT,
      current_deployment_id TEXT,
      frost_file_path TEXT DEFAULT 'frost.yaml',
      replica_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      UNIQUE(environment_id, name)
    );

    INSERT INTO services_new (
      id,
      environment_id,
      name,
      hostname,
      deploy_type,
      service_type,
      repo_url,
      branch,
      dockerfile_path,
      build_context,
      image_url,
      registry_id,
      env_vars,
      container_port,
      health_check_path,
      health_check_timeout,
      auto_deploy,
      volumes,
      tcp_proxy_port,
      memory_limit,
      cpu_limit,
      shutdown_timeout,
      drain_timeout,
      request_timeout,
      command,
      icon,
      current_deployment_id,
      frost_file_path,
      replica_count,
      created_at
    )
    SELECT
      ${selectExistingColumn(columns, "id", "lower(hex(randomblob(10)))")},
      ${selectExistingColumn(columns, "environment_id", "''")},
      ${selectExistingColumn(columns, "name", "'service'")},
      ${selectExistingColumn(columns, "hostname", "NULL")},
      ${selectExistingColumn(columns, "deploy_type", "'repo'")},
      COALESCE(${columns.has("service_type") ? "service_type" : "NULL"}, 'app'),
      ${selectExistingColumn(columns, "repo_url", "NULL")},
      ${selectExistingColumn(columns, "branch", "'main'")},
      ${selectExistingColumn(columns, "dockerfile_path", "'Dockerfile'")},
      ${selectExistingColumn(columns, "build_context", "NULL")},
      ${selectExistingColumn(columns, "image_url", "NULL")},
      ${selectExistingColumn(columns, "registry_id", "NULL")},
      ${selectExistingColumn(columns, "env_vars", "'[]'")},
      ${selectExistingColumn(columns, "container_port", "8080")},
      ${selectExistingColumn(columns, "health_check_path", "NULL")},
      ${selectExistingColumn(columns, "health_check_timeout", "60")},
      ${selectExistingColumn(columns, "auto_deploy", "1")},
      ${selectExistingColumn(columns, "volumes", "'[]'")},
      ${selectExistingColumn(columns, "tcp_proxy_port", "NULL")},
      ${selectExistingColumn(columns, "memory_limit", "NULL")},
      ${selectExistingColumn(columns, "cpu_limit", "NULL")},
      ${selectExistingColumn(columns, "shutdown_timeout", "NULL")},
      ${selectExistingColumn(columns, "drain_timeout", "NULL")},
      ${selectExistingColumn(columns, "request_timeout", "NULL")},
      ${selectExistingColumn(columns, "command", "NULL")},
      ${selectExistingColumn(columns, "icon", "NULL")},
      ${selectExistingColumn(columns, "current_deployment_id", "NULL")},
      ${selectExistingColumn(columns, "frost_file_path", "'frost.yaml'")},
      ${selectExistingColumn(columns, "replica_count", "1")},
      ${selectExistingColumn(columns, "created_at", "strftime('%s','now') * 1000")}
    FROM services;

    DROP TABLE services;
    ALTER TABLE services_new RENAME TO services;

    CREATE INDEX idx_services_environment_id ON services(environment_id);
    CREATE UNIQUE INDEX idx_services_environment_hostname ON services(environment_id, hostname);
  `);
}

function createObjectStorageTables(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS object_storages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'garage' CHECK (engine IN ('garage')),
      runtime_service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      region TEXT NOT NULL DEFAULT 'auto',
      internal_endpoint TEXT NOT NULL,
      external_endpoint TEXT,
      admin_token_encrypted TEXT NOT NULL,
      metrics_token_encrypted TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(environment_id, name),
      UNIQUE(environment_id, slug),
      UNIQUE(runtime_service_id)
    );

    CREATE INDEX IF NOT EXISTS idx_object_storages_project_id ON object_storages(project_id);
    CREATE INDEX IF NOT EXISTS idx_object_storages_environment_id ON object_storages(environment_id);
    CREATE INDEX IF NOT EXISTS idx_object_storages_runtime_service_id ON object_storages(runtime_service_id);

    CREATE TABLE IF NOT EXISTS object_storage_buckets (
      id TEXT PRIMARY KEY,
      object_storage_id TEXT NOT NULL REFERENCES object_storages(id) ON DELETE CASCADE,
      garage_bucket_id TEXT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(object_storage_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_object_storage_buckets_object_storage_id ON object_storage_buckets(object_storage_id);

    CREATE TABLE IF NOT EXISTS object_storage_access_keys (
      id TEXT PRIMARY KEY,
      object_storage_id TEXT NOT NULL REFERENCES object_storages(id) ON DELETE CASCADE,
      bucket_id TEXT REFERENCES object_storage_buckets(id) ON DELETE SET NULL,
      access_key_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      permissions TEXT NOT NULL CHECK (permissions IN ('read-only', 'read-write', 'full')),
      secret_access_key_encrypted TEXT,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      UNIQUE(object_storage_id, access_key_id)
    );

    CREATE INDEX IF NOT EXISTS idx_object_storage_access_keys_object_storage_id ON object_storage_access_keys(object_storage_id);
    CREATE INDEX IF NOT EXISTS idx_object_storage_access_keys_bucket_id ON object_storage_access_keys(bucket_id);
  `);
}

function ensureObjectStorageSchema(sqlite: Database, upgrades: string[]): void {
  if (!hasTable(sqlite, "services") || !hasTable(sqlite, "environments")) {
    return;
  }

  const serviceSql = getTableSql(sqlite, "services");
  const needsServiceTypeUpgrade = !serviceSql.includes("'object-storage'");
  const needsObjectStorageTables = !hasTable(sqlite, "object_storages");

  if (!needsServiceTypeUpgrade && !needsObjectStorageTables) {
    return;
  }

  console.log("[migrate] Running schema upgrade: object storage support");
  sqlite.exec("PRAGMA foreign_keys = OFF");
  sqlite.exec("BEGIN EXCLUSIVE");
  try {
    if (needsServiceTypeUpgrade) {
      rebuildServicesForObjectStorage(sqlite);
    }

    createObjectStorageTables(sqlite);

    sqlite.exec("COMMIT");
    sqlite.exec("PRAGMA foreign_keys = ON");
    upgrades.push("object-storage");
    console.log("[migrate] Schema upgrade complete: object storage support");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    sqlite.exec("PRAGMA foreign_keys = ON");
    console.error("[migrate] Object storage schema upgrade failed:", err);
    throw err;
  }
}
