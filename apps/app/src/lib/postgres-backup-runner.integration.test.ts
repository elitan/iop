import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { CreateBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import { db } from "./db";
import { runMigrations } from "./migrate";
import { updatePostgresBackupConfig } from "./postgres-backup-config";
import {
  listPostgresBackups,
  restorePostgresBackup,
  runPostgresBackup,
} from "./postgres-backup-runner";
import { createPostgresBackupS3Client } from "./postgres-backup-s3";
import { shellEscape } from "./shell-escape";

const execAsync = promisify(exec);

const MINIO_CONTAINER = "frost-test-postgres-backup-runner-minio";
const POSTGRES_CONTAINER = "frost-test-postgres-backup-runner-postgres";
const MINIO_PORT = 19996;
const POSTGRES_PORT = 19997;
const MINIO_ENDPOINT = `http://127.0.0.1:${MINIO_PORT}`;
const MINIO_ACCESS_KEY = "minioadmin";
const MINIO_SECRET_KEY = "minioadmin";
const MINIO_BUCKET = "frost-test-runner-backups";

async function startMinio(): Promise<void> {
  await execAsync(`docker rm -f ${MINIO_CONTAINER}`).catch(
    function ignore() {},
  );
  await execAsync(
    `docker run -d --name ${MINIO_CONTAINER} -p ${MINIO_PORT}:9000 ` +
      `-e MINIO_ROOT_USER=${MINIO_ACCESS_KEY} -e MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY} ` +
      `minio/minio:latest server /data`,
  );
}

async function startPostgres(): Promise<void> {
  await execAsync(`docker rm -f ${POSTGRES_CONTAINER}`).catch(
    function ignore() {},
  );
  await execAsync(
    `docker run -d --name ${POSTGRES_CONTAINER} -p ${POSTGRES_PORT}:5432 ` +
      `-e POSTGRES_USER=frost -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=frost_main ` +
      `postgres:17-alpine`,
  );
}

async function waitForMinioReady(client: S3Client): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: MINIO_BUCKET,
        }),
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("BucketAlreadyOwnedByYou")) {
        return;
      }
      await new Promise(function wait(resolve) {
        setTimeout(resolve, 1000);
      });
    }
  }

  throw new Error("MinIO did not become ready");
}

async function waitForPostgresReady(): Promise<void> {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await execAsync(
        `docker exec ${POSTGRES_CONTAINER} pg_isready -h 127.0.0.1 -U frost -d frost_main`,
      );
      return;
    } catch {
      await new Promise(function wait(resolve) {
        setTimeout(resolve, 1000);
      });
    }
  }

  throw new Error("Postgres did not become ready");
}

async function runSql(sql: string): Promise<void> {
  await execAsync(
    `docker exec -e PGPASSWORD=secret ${POSTGRES_CONTAINER} ` +
      `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U frost -d frost_main -c ${shellEscape(sql)}`,
  );
}

async function readSingleValue(sql: string): Promise<string> {
  const { stdout } = await execAsync(
    `docker exec -e PGPASSWORD=secret ${POSTGRES_CONTAINER} ` +
      `psql -X -t -A -h 127.0.0.1 -U frost -d frost_main -c ${shellEscape(sql)}`,
  );
  return stdout.trim();
}

describe("postgres backup runner integration", () => {
  const s3Client = createPostgresBackupS3Client({
    provider: "custom",
    endpoint: MINIO_ENDPOINT,
    region: "us-east-1",
    bucket: MINIO_BUCKET,
    prefix: "frost-tests",
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
    forcePathStyle: true,
  });

  beforeAll(async () => {
    runMigrations();
    await startMinio();
    await startPostgres();
    await waitForMinioReady(s3Client);
    await waitForPostgresReady();
  }, 180000);

  afterAll(async () => {
    await execAsync(`docker rm -f ${MINIO_CONTAINER}`).catch(
      function ignore() {},
    );
    await execAsync(`docker rm -f ${POSTGRES_CONTAINER}`).catch(
      function ignore() {},
    );
  });

  test("backup then restore existing branch", async () => {
    const projectId = randomUUID();
    const databaseId = randomUUID();
    const targetId = randomUUID();
    const runtimeServiceId = randomUUID();
    const now = Date.now();
    const targetName = "main";

    try {
      await db
        .insertInto("projects")
        .values({
          id: projectId,
          name: `proj-${projectId.slice(0, 8)}`,
          hostname: null,
          createdAt: now,
        })
        .execute();

      await db
        .insertInto("databases")
        .values({
          id: databaseId,
          projectId,
          name: `pg-${databaseId.slice(0, 8)}`,
          engine: "postgres",
          provider: "mysql-docker",
          createdAt: now,
        })
        .execute();

      await db
        .insertInto("databaseTargets")
        .values({
          id: targetId,
          databaseId,
          name: targetName,
          hostname: targetName,
          kind: "branch",
          sourceTargetId: null,
          runtimeServiceId,
          lifecycleStatus: "active",
          providerRefJson: JSON.stringify({
            containerName: POSTGRES_CONTAINER,
            hostPort: POSTGRES_PORT,
            username: "frost",
            password: "secret",
            database: "frost_main",
            ssl: false,
            image: "postgres:17-alpine",
            port: 5432,
            memoryLimit: null,
            cpuLimit: null,
          }),
          createdAt: now,
        })
        .execute();

      await updatePostgresBackupConfig({
        databaseId,
        config: {
          enabled: true,
          selectedTargetIds: [targetId],
          intervalValue: 1,
          intervalUnit: "hours",
          retentionDays: 30,
          s3Provider: "custom",
          s3Endpoint: MINIO_ENDPOINT,
          s3Region: "us-east-1",
          s3Bucket: MINIO_BUCKET,
          s3Prefix: `runner/${databaseId}`,
          s3AccessKeyId: MINIO_ACCESS_KEY,
          s3SecretAccessKey: MINIO_SECRET_KEY,
          s3ForcePathStyle: true,
          includeGlobals: true,
        },
      });

      await runSql("DROP TABLE IF EXISTS backup_test;");
      await runSql("CREATE TABLE backup_test (value TEXT NOT NULL);");
      await runSql("INSERT INTO backup_test(value) VALUES ('before');");

      await runPostgresBackup(databaseId);
      const backups = await listPostgresBackups(databaseId);
      expect(backups.length).toBeGreaterThan(0);

      await runSql("DELETE FROM backup_test;");
      await runSql("INSERT INTO backup_test(value) VALUES ('after');");
      expect(
        await readSingleValue("SELECT value FROM backup_test LIMIT 1;"),
      ).toBe("after");

      await restorePostgresBackup({
        databaseId,
        backupPath: backups[0].backupPath,
        targetBranchName: "main",
        createIfMissing: true,
        allowOverwrite: true,
      });

      expect(
        await readSingleValue("SELECT value FROM backup_test LIMIT 1;"),
      ).toBe("before");
    } finally {
      await db
        .deleteFrom("databaseBackupConfigs")
        .where("databaseId", "=", databaseId)
        .execute();
      await db
        .deleteFrom("databaseTargets")
        .where("databaseId", "=", databaseId)
        .execute();
      await db.deleteFrom("databases").where("id", "=", databaseId).execute();
      await db.deleteFrom("projects").where("id", "=", projectId).execute();
    }
  }, 180000);
});
