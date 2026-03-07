import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { deleteDatabase } from "./database-runtime";
import { db } from "./db";
import { runMigrations } from "./migrate";
import {
  createDatabaseImportJob,
  getDatabaseImportJob,
  triggerDatabaseImport,
} from "./postgres-import";
import { shellEscape } from "./shell-escape";

const execAsync = promisify(exec);

const SOURCE_CONTAINER = "frost-test-postgres-import-source";
let sourcePort = 0;

async function startSourcePostgres(): Promise<number> {
  await execAsync(`docker rm -f ${SOURCE_CONTAINER}`).catch(
    function ignore() {},
  );
  await execAsync(
    `docker run -d --name ${SOURCE_CONTAINER} -P ` +
      `-e POSTGRES_USER=source -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=source_app ` +
      `postgres:17-alpine`,
  );

  const { stdout } = await execAsync(
    `docker port ${SOURCE_CONTAINER} 5432/tcp`,
  );
  const firstLine = stdout
    .split("\n")
    .map(function trimLine(line) {
      return line.trim();
    })
    .find(function hasValue(line) {
      return line.length > 0;
    });

  if (!firstLine) {
    throw new Error("Source postgres port mapping missing");
  }

  const port = Number(firstLine.split(":").pop());
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid source postgres port: ${firstLine}`);
  }

  return port;
}

async function waitForSourceReady(): Promise<void> {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await execAsync(
        `docker exec ${SOURCE_CONTAINER} pg_isready -h 127.0.0.1 -U source -d source_app`,
      );
      return;
    } catch {
      await new Promise(function wait(resolve) {
        setTimeout(resolve, 1000);
      });
    }
  }

  throw new Error("Source postgres did not become ready");
}

async function runSourceSql(sql: string): Promise<void> {
  await execAsync(
    `docker exec -e PGPASSWORD=secret ${SOURCE_CONTAINER} ` +
      `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U source -d source_app -c ${shellEscape(sql)}`,
  );
}

async function readTargetValue(input: {
  containerName: string;
  username: string;
  password: string;
  database: string;
  sql: string;
}): Promise<string> {
  const { stdout } = await execAsync(
    `docker exec -e PGPASSWORD=${shellEscape(input.password)} ${shellEscape(input.containerName)} ` +
      `psql -X -t -A -h 127.0.0.1 -U ${shellEscape(input.username)} -d ${shellEscape(input.database)} -c ${shellEscape(input.sql)}`,
  );
  return stdout.trim();
}

async function waitForImportJobStage(input: {
  jobId: string;
  expectedStage: "completed" | "failed";
}): Promise<Awaited<ReturnType<typeof getDatabaseImportJob>>> {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const job = await getDatabaseImportJob(input.jobId);
    if (job.stage === input.expectedStage || job.stage === "failed") {
      return job;
    }
    await new Promise(function wait(resolve) {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error(`Import job did not reach ${input.expectedStage}`);
}

describe("postgres import integration", () => {
  beforeAll(async function setup() {
    runMigrations();
    sourcePort = await startSourcePostgres();
    await waitForSourceReady();
  }, 180000);

  afterAll(async function teardown() {
    await execAsync(`docker rm -f ${SOURCE_CONTAINER}`).catch(
      function ignore() {},
    );
  });

  test("imports an existing postgres database", async function importExistingPostgres() {
    const projectId = randomUUID();
    const projectName = `proj-${projectId.slice(0, 8)}`;
    const sourceUrl = `postgresql://source:secret@127.0.0.1:${sourcePort}/source_app?sslmode=disable`;
    let databaseId: string | null = null;

    await db
      .insertInto("projects")
      .values({
        id: projectId,
        name: projectName,
        hostname: null,
        createdAt: Date.now(),
      })
      .execute();

    try {
      await runSourceSql("DROP TABLE IF EXISTS import_users;");
      await runSourceSql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
      await runSourceSql(
        "CREATE TABLE import_users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);",
      );
      await runSourceSql(
        "INSERT INTO import_users(name) VALUES ('alice'), ('bob');",
      );

      const preflightJob = await createDatabaseImportJob({
        projectId,
        targetName: "prod-db",
        sourceUrl,
      });
      expect(preflightJob.stage).toBe("preflight");
      expect(
        preflightJob.checkResults.find(function findCheck(check) {
          return check.key === "extensions";
        })?.status,
      ).toBe("ok");

      const importJob = await triggerDatabaseImport(preflightJob.id);
      databaseId = importJob.databaseId;
      expect(databaseId).not.toBeNull();

      const completedJob = await waitForImportJobStage({
        jobId: preflightJob.id,
        expectedStage: "completed",
      });
      expect(completedJob.stage).toBe("completed");
      expect(completedJob.targetConnection).not.toBeNull();

      const targetConnection = completedJob.targetConnection;
      if (!targetConnection) {
        throw new Error("Target connection missing");
      }
      if (!databaseId) {
        throw new Error("Database id missing");
      }

      const target = await db
        .selectFrom("databaseTargets")
        .select("providerRefJson")
        .where("databaseId", "=", databaseId)
        .where("name", "=", "main")
        .executeTakeFirst();

      if (!target) {
        throw new Error("Target runtime missing");
      }

      const providerRef = JSON.parse(target.providerRefJson) as {
        containerName: string;
        image: string;
      };
      expect(providerRef.image).toBe("postgres:17");

      const importedCount = await readTargetValue({
        containerName: providerRef.containerName,
        username: targetConnection.username,
        password: targetConnection.password,
        database: targetConnection.database,
        sql: "SELECT count(*) FROM import_users;",
      });
      expect(importedCount).toBe("2");

      const importedExtension = await readTargetValue({
        containerName: providerRef.containerName,
        username: targetConnection.username,
        password: targetConnection.password,
        database: targetConnection.database,
        sql: "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';",
      });
      expect(importedExtension).toBe("pg_trgm");
    } finally {
      if (databaseId) {
        await deleteDatabase(databaseId).catch(function ignore() {});
      }
      await db
        .deleteFrom("databaseImportJobs")
        .where("projectId", "=", projectId)
        .execute();
      await db.deleteFrom("projects").where("id", "=", projectId).execute();
    }
  }, 180000);

  test("fails preflight when credentials are wrong", async function failPreflight() {
    const projectId = randomUUID();
    const projectName = `proj-${projectId.slice(0, 8)}`;

    await db
      .insertInto("projects")
      .values({
        id: projectId,
        name: projectName,
        hostname: null,
        createdAt: Date.now(),
      })
      .execute();

    try {
      const job = await createDatabaseImportJob({
        projectId,
        targetName: "blocked-db",
        sourceUrl: `postgresql://source:wrong@127.0.0.1:${sourcePort}/source_app?sslmode=disable`,
      });

      expect(job.stage).toBe("failed");
      expect(
        job.checkResults.some(function hasBlockedCheck(check) {
          return check.status === "blocked";
        }),
      ).toBe(true);
    } finally {
      await db
        .deleteFrom("databaseImportJobs")
        .where("projectId", "=", projectId)
        .execute();
      await db.deleteFrom("projects").where("id", "=", projectId).execute();
    }
  }, 180000);
});
