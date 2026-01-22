import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import { getDbPath } from "./paths";

export interface MigrationResult {
  applied: number;
  bootstrapped: boolean;
  schemaUpgrades: string[];
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
          pr_comment_id INTEGER,
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
        const envId = nanoid();
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

  return upgrades;
}
