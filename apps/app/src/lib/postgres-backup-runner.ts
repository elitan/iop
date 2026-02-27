import { exec, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createDatabaseTarget,
  type DatabaseEngine,
  startDatabaseTarget,
} from "./database-runtime";
import { db } from "./db";
import {
  getPostgresBackupConfig,
  getPostgresBackupConfigForRun,
  markPostgresBackupRunFinished,
  markPostgresBackupRunStarted,
} from "./postgres-backup-config";
import {
  createPostgresBackupS3Client,
  deleteS3Objects,
  getBufferFromS3,
  getTextFromS3,
  joinS3Key,
  listS3Objects,
  normalizeS3Prefix,
  putFileToS3,
  putTextToS3,
  testS3Connection,
} from "./postgres-backup-s3";
import { shellEscape } from "./shell-escape";

const execAsync = promisify(exec);
const POSTGRES_READY_MAX_ATTEMPTS = 60;
const POSTGRES_READY_RETRY_DELAY_MS = 1000;

interface ProviderRef {
  containerName: string;
  hostPort: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  image: string;
  port: number;
}

interface DatabaseTargetRow {
  id: string;
  databaseId: string;
  name: string;
  lifecycleStatus: "active" | "stopped" | "expired";
  providerRefJson: string;
}

export interface PostgresBackupManifest {
  version: 1;
  databaseId: string;
  sourceTargetId: string;
  sourceTargetName: string;
  createdAt: number;
  createdAtIso: string;
  dumpKey: string;
  dumpSizeBytes: number;
  globalsKey: string | null;
  globalsSizeBytes: number | null;
}

export interface PostgresBackupBranchResult {
  sourceTargetId: string;
  sourceTargetName: string;
  manifestKey: string;
  dumpKey: string;
  globalsKey: string | null;
  createdAt: number;
}

export interface PostgresBackupRunResult {
  databaseId: string;
  startedAt: number;
  finishedAt: number;
  branchResults: PostgresBackupBranchResult[];
  deletedByRetention: number;
}

export interface PostgresBackupListItem {
  backupPath: string;
  sourceTargetId: string;
  sourceTargetName: string;
  createdAt: number;
  createdAtIso: string;
  dumpSizeBytes: number;
  hasGlobals: boolean;
}

export interface PostgresBackupRestoreResult {
  databaseId: string;
  sourceTargetName: string;
  targetBranchName: string;
  targetId: string;
  createdBranch: boolean;
  startedAt: number;
  finishedAt: number;
  warnings: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(function wait(resolve) {
    setTimeout(resolve, ms);
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseProviderRef(json: string): ProviderRef {
  const value = JSON.parse(json) as Partial<ProviderRef>;
  if (
    typeof value.containerName !== "string" ||
    typeof value.hostPort !== "number" ||
    typeof value.username !== "string" ||
    typeof value.password !== "string" ||
    typeof value.database !== "string" ||
    typeof value.ssl !== "boolean" ||
    typeof value.image !== "string" ||
    typeof value.port !== "number"
  ) {
    throw new Error("Invalid provider reference");
  }

  return {
    containerName: value.containerName,
    hostPort: value.hostPort,
    username: value.username,
    password: value.password,
    database: value.database,
    ssl: value.ssl,
    image: value.image,
    port: value.port,
  };
}

async function runShellCommand(command: string): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    maxBuffer: 20 * 1024 * 1024,
  });
  const combined = [stdout.trim(), stderr.trim()]
    .filter(function hasValue(value) {
      return value.length > 0;
    })
    .join("\n");
  return combined;
}

async function runShellCommandToFile(input: {
  command: string;
  filePath: string;
}): Promise<void> {
  await new Promise<void>(function run(resolve, reject) {
    const child = spawn("sh", ["-lc", input.command], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const fileStream = createWriteStream(input.filePath);

    child.stdout.on("data", function onData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileStream.write(buffer);
    });

    child.stderr.on("data", function onErrorData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
    });

    child.on("error", function onError(error) {
      fileStream.end();
      reject(error);
    });

    child.on("close", function onClose(code) {
      if (code === 0) {
        fileStream.end(function onFinish() {
          resolve();
        });
        return;
      }
      fileStream.end();
      const stderr = Buffer.concat(chunks).toString("utf8").trim();
      reject(new Error(stderr || "command failed"));
    });
  });
}

async function waitForPostgresReady(providerRef: ProviderRef): Promise<void> {
  const command =
    `docker exec ${shellEscape(providerRef.containerName)} ` +
    `pg_isready -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d ${shellEscape(providerRef.database)}`;

  for (let attempt = 1; attempt <= POSTGRES_READY_MAX_ATTEMPTS; attempt += 1) {
    try {
      await execAsync(command);
      return;
    } catch {
      if (attempt >= POSTGRES_READY_MAX_ATTEMPTS) {
        break;
      }
      await sleep(POSTGRES_READY_RETRY_DELAY_MS);
    }
  }

  throw new Error(`Postgres target ${providerRef.containerName} is not ready`);
}

async function getPostgresTargetRows(input: {
  databaseId: string;
  targetIds: string[];
}): Promise<DatabaseTargetRow[]> {
  const rows = await db
    .selectFrom("databaseTargets")
    .select(["id", "databaseId", "name", "lifecycleStatus", "providerRefJson"])
    .where("databaseId", "=", input.databaseId)
    .where("id", "in", input.targetIds)
    .execute();

  const byId = new Map(
    rows.map(function toTuple(row) {
      return [row.id, row as DatabaseTargetRow] as const;
    }),
  );

  return input.targetIds
    .map(function toOrdered(id) {
      return byId.get(id) ?? null;
    })
    .filter(function isRow(row): row is DatabaseTargetRow {
      return row !== null;
    });
}

function getTimestampToken(now: Date): string {
  const iso = now.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function buildBackupManifest(input: {
  databaseId: string;
  target: DatabaseTargetRow;
  createdAt: number;
  dumpKey: string;
  dumpSizeBytes: number;
  globalsKey: string | null;
  globalsSizeBytes: number | null;
}): Promise<PostgresBackupManifest> {
  return {
    version: 1,
    databaseId: input.databaseId,
    sourceTargetId: input.target.id,
    sourceTargetName: input.target.name,
    createdAt: input.createdAt,
    createdAtIso: new Date(input.createdAt).toISOString(),
    dumpKey: input.dumpKey,
    dumpSizeBytes: input.dumpSizeBytes,
    globalsKey: input.globalsKey,
    globalsSizeBytes: input.globalsSizeBytes,
  };
}

async function ensureDatabaseIsPostgres(databaseId: string): Promise<void> {
  const row = await db
    .selectFrom("databases")
    .select(["id", "engine"])
    .where("id", "=", databaseId)
    .executeTakeFirst();

  if (!row) {
    throw new Error("Database not found");
  }

  if ((row.engine as DatabaseEngine) !== "postgres") {
    throw new Error("Backup is only available for postgres databases");
  }
}

async function enforceRetention(input: {
  databaseId: string;
  retentionDays: number;
  bucket: string;
  prefix: string;
  client: ReturnType<typeof createPostgresBackupS3Client>;
}): Promise<number> {
  const retentionMs = input.retentionDays * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - retentionMs;
  const databasePrefix = joinS3Key(input.prefix, input.databaseId);
  const objects = await listS3Objects({
    client: input.client,
    bucket: input.bucket,
    prefix: `${databasePrefix}/`,
  });

  const keysToDelete = objects
    .filter(function shouldDelete(item) {
      return item.lastModified !== null && item.lastModified < threshold;
    })
    .map(function toKey(item) {
      return item.key;
    });

  await deleteS3Objects({
    client: input.client,
    bucket: input.bucket,
    keys: keysToDelete,
  });

  return keysToDelete.length;
}

export async function runPostgresBackup(
  databaseId: string,
): Promise<PostgresBackupRunResult> {
  await ensureDatabaseIsPostgres(databaseId);
  const startedAt = Date.now();
  const lockAcquired = await markPostgresBackupRunStarted(databaseId);
  if (!lockAcquired) {
    throw new Error("Backup already running");
  }

  try {
    const config = await getPostgresBackupConfigForRun(databaseId);
    const targets = await getPostgresTargetRows({
      databaseId,
      targetIds: config.selectedTargetIds,
    });

    if (targets.length === 0) {
      throw new Error("No selected branches found");
    }

    const client = createPostgresBackupS3Client({
      provider: config.s3Provider,
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      bucket: config.s3Bucket,
      prefix: config.s3Prefix,
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
      forcePathStyle: config.s3ForcePathStyle,
    });
    const normalizedPrefix = normalizeS3Prefix(config.s3Prefix);
    const tempDir = await mkdtemp(join(tmpdir(), "frost-postgres-backup-"));
    const branchResults: PostgresBackupBranchResult[] = [];

    try {
      let globalsFilePath: string | null = null;
      let globalsSizeBytes: number | null = null;

      if (config.includeGlobals) {
        const globalsProviderRef = parseProviderRef(targets[0].providerRefJson);
        await waitForPostgresReady(globalsProviderRef);

        globalsFilePath = join(tempDir, "globals.sql");
        const globalsCommand =
          `docker exec -e PGPASSWORD=${shellEscape(globalsProviderRef.password)} ${shellEscape(globalsProviderRef.containerName)} ` +
          `pg_dumpall -h 127.0.0.1 -U ${shellEscape(globalsProviderRef.username)} --globals-only`;

        await runShellCommandToFile({
          command: globalsCommand,
          filePath: globalsFilePath,
        });
        const globalsStat = await stat(globalsFilePath);
        globalsSizeBytes = globalsStat.size;
      }

      for (const target of targets) {
        const providerRef = parseProviderRef(target.providerRefJson);
        await waitForPostgresReady(providerRef);

        const now = new Date();
        const createdAt = now.getTime();
        const timestampToken = getTimestampToken(now);
        const basePrefix = joinS3Key(
          normalizedPrefix,
          databaseId,
          target.name,
          timestampToken,
        );
        const dumpKey = joinS3Key(basePrefix, "dump.pgdump");
        const globalsKey = config.includeGlobals
          ? joinS3Key(basePrefix, "globals.sql")
          : null;
        const manifestKey = joinS3Key(basePrefix, "manifest.json");
        const dumpFilePath = join(tempDir, `${target.id}-dump.pgdump`);
        const dumpCommand =
          `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(providerRef.containerName)} ` +
          `pg_dump -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d ${shellEscape(providerRef.database)} -Fc`;

        await runShellCommandToFile({
          command: dumpCommand,
          filePath: dumpFilePath,
        });
        const dumpStat = await stat(dumpFilePath);

        await putFileToS3({
          client,
          bucket: config.s3Bucket,
          key: dumpKey,
          filePath: dumpFilePath,
          contentType: "application/octet-stream",
        });

        if (globalsKey) {
          const globalsPath = join(tempDir, "globals.sql");
          await putFileToS3({
            client,
            bucket: config.s3Bucket,
            key: globalsKey,
            filePath: globalsPath,
            contentType: "application/sql",
          });
        }

        const manifest = await buildBackupManifest({
          databaseId,
          target,
          createdAt,
          dumpKey,
          dumpSizeBytes: dumpStat.size,
          globalsKey,
          globalsSizeBytes,
        });
        await putTextToS3({
          client,
          bucket: config.s3Bucket,
          key: manifestKey,
          text: JSON.stringify(manifest, null, 2),
          contentType: "application/json",
        });

        branchResults.push({
          sourceTargetId: target.id,
          sourceTargetName: target.name,
          manifestKey,
          dumpKey,
          globalsKey,
          createdAt,
        });
      }

      const deletedByRetention = await enforceRetention({
        databaseId,
        retentionDays: config.retentionDays,
        bucket: config.s3Bucket,
        prefix: normalizedPrefix,
        client,
      });
      const finishedAt = Date.now();

      await markPostgresBackupRunFinished({
        databaseId,
        success: true,
        error: null,
      });

      return {
        databaseId,
        startedAt,
        finishedAt,
        branchResults,
        deletedByRetention,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backup run failed";
    await markPostgresBackupRunFinished({
      databaseId,
      success: false,
      error: message,
    });
    throw error;
  }
}

export async function testPostgresBackupConnection(
  databaseId: string,
): Promise<{ success: true }> {
  const config = await getPostgresBackupConfigForRun(databaseId);
  const client = createPostgresBackupS3Client({
    provider: config.s3Provider,
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    bucket: config.s3Bucket,
    prefix: config.s3Prefix,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    forcePathStyle: config.s3ForcePathStyle,
  });

  await testS3Connection({
    client,
    bucket: config.s3Bucket,
    prefix: joinS3Key(normalizeS3Prefix(config.s3Prefix), databaseId),
  });

  return { success: true };
}

function parseBackupManifest(json: string): PostgresBackupManifest {
  const value = JSON.parse(json) as Partial<PostgresBackupManifest>;

  if (
    value.version !== 1 ||
    typeof value.databaseId !== "string" ||
    typeof value.sourceTargetId !== "string" ||
    typeof value.sourceTargetName !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.createdAtIso !== "string" ||
    typeof value.dumpKey !== "string" ||
    typeof value.dumpSizeBytes !== "number"
  ) {
    throw new Error("Invalid backup manifest");
  }

  return {
    version: 1,
    databaseId: value.databaseId,
    sourceTargetId: value.sourceTargetId,
    sourceTargetName: value.sourceTargetName,
    createdAt: value.createdAt,
    createdAtIso: value.createdAtIso,
    dumpKey: value.dumpKey,
    dumpSizeBytes: value.dumpSizeBytes,
    globalsKey: value.globalsKey ?? null,
    globalsSizeBytes: value.globalsSizeBytes ?? null,
  };
}

export async function listPostgresBackups(
  databaseId: string,
): Promise<PostgresBackupListItem[]> {
  const basicConfig = await getPostgresBackupConfig(databaseId);
  if (
    basicConfig.s3Bucket.trim().length === 0 ||
    !basicConfig.hasSecretAccessKey ||
    basicConfig.s3AccessKeyId.trim().length === 0
  ) {
    return [];
  }

  const config = await getPostgresBackupConfigForRun(databaseId);
  const client = createPostgresBackupS3Client({
    provider: config.s3Provider,
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    bucket: config.s3Bucket,
    prefix: config.s3Prefix,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    forcePathStyle: config.s3ForcePathStyle,
  });
  const prefix = joinS3Key(normalizeS3Prefix(config.s3Prefix), databaseId);
  const objects = await listS3Objects({
    client,
    bucket: config.s3Bucket,
    prefix: `${prefix}/`,
  });

  const manifestKeys = objects
    .map(function toKey(item) {
      return item.key;
    })
    .filter(function isManifest(key) {
      return key.endsWith("/manifest.json");
    });

  const items: PostgresBackupListItem[] = [];
  for (const manifestKey of manifestKeys) {
    try {
      const json = await getTextFromS3({
        client,
        bucket: config.s3Bucket,
        key: manifestKey,
      });
      const manifest = parseBackupManifest(json);
      items.push({
        backupPath: manifestKey,
        sourceTargetId: manifest.sourceTargetId,
        sourceTargetName: manifest.sourceTargetName,
        createdAt: manifest.createdAt,
        createdAtIso: manifest.createdAtIso,
        dumpSizeBytes: manifest.dumpSizeBytes,
        hasGlobals: manifest.globalsKey !== null,
      });
    } catch {}
  }

  return items.sort(function byNewest(left, right) {
    return right.createdAt - left.createdAt;
  });
}

async function getTargetByName(input: {
  databaseId: string;
  targetName: string;
}): Promise<DatabaseTargetRow | null> {
  const row = await db
    .selectFrom("databaseTargets")
    .select(["id", "databaseId", "name", "lifecycleStatus", "providerRefJson"])
    .where("databaseId", "=", input.databaseId)
    .where("name", "=", input.targetName)
    .executeTakeFirst();
  return (row as DatabaseTargetRow | undefined) ?? null;
}

async function getTargetById(
  targetId: string,
): Promise<DatabaseTargetRow | null> {
  const row = await db
    .selectFrom("databaseTargets")
    .select(["id", "databaseId", "name", "lifecycleStatus", "providerRefJson"])
    .where("id", "=", targetId)
    .executeTakeFirst();
  return (row as DatabaseTargetRow | undefined) ?? null;
}

async function ensureTargetActive(input: {
  databaseId: string;
  target: DatabaseTargetRow;
}): Promise<DatabaseTargetRow> {
  if (input.target.lifecycleStatus === "active") {
    return input.target;
  }

  await startDatabaseTarget({
    databaseId: input.databaseId,
    targetId: input.target.id,
  });

  const refreshed = await getTargetById(input.target.id);
  if (!refreshed) {
    throw new Error("Target not found after start");
  }
  return refreshed;
}

async function restoreIntoTarget(input: {
  target: DatabaseTargetRow;
  dumpFilePath: string;
  globalsFilePath: string | null;
}): Promise<string[]> {
  const warnings: string[] = [];
  const providerRef = parseProviderRef(input.target.providerRefJson);
  await waitForPostgresReady(providerRef);

  const containerName = providerRef.containerName;
  const remoteDumpPath = `/tmp/frost-restore-${Date.now()}-${Math.random().toString(16).slice(2)}.pgdump`;
  const remoteGlobalsPath = `/tmp/frost-restore-${Date.now()}-${Math.random().toString(16).slice(2)}.globals.sql`;

  try {
    await runShellCommand(
      `docker cp ${shellEscape(input.dumpFilePath)} ${shellEscape(containerName)}:${shellEscape(remoteDumpPath)}`,
    );

    if (input.globalsFilePath) {
      await runShellCommand(
        `docker cp ${shellEscape(input.globalsFilePath)} ${shellEscape(containerName)}:${shellEscape(remoteGlobalsPath)}`,
      );
      try {
        await runShellCommand(
          `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(containerName)} ` +
            `psql -X -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d postgres -f ${shellEscape(remoteGlobalsPath)}`,
        );
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? error.message
            : "Failed to apply globals restore",
        );
      }
    }

    await runShellCommand(
      `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(containerName)} ` +
        `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d postgres ` +
        `-c ${shellEscape(`DROP DATABASE IF EXISTS ${quoteIdentifier(providerRef.database)};`)}`,
    );
    await runShellCommand(
      `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(containerName)} ` +
        `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d postgres ` +
        `-c ${shellEscape(`CREATE DATABASE ${quoteIdentifier(providerRef.database)};`)}`,
    );
    await runShellCommand(
      `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(containerName)} ` +
        `pg_restore -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d ${shellEscape(providerRef.database)} ` +
        `--clean --if-exists --no-owner --no-privileges ${shellEscape(remoteDumpPath)}`,
    );
  } finally {
    await runShellCommand(
      `docker exec ${shellEscape(containerName)} rm -f ${shellEscape(remoteDumpPath)} ${shellEscape(remoteGlobalsPath)}`,
    ).catch(function ignore() {});
  }

  return warnings;
}

export async function restorePostgresBackup(input: {
  databaseId: string;
  backupPath: string;
  targetBranchName?: string;
  createIfMissing?: boolean;
  allowOverwrite?: boolean;
}): Promise<PostgresBackupRestoreResult> {
  await ensureDatabaseIsPostgres(input.databaseId);
  const config = await getPostgresBackupConfigForRun(input.databaseId);
  const client = createPostgresBackupS3Client({
    provider: config.s3Provider,
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    bucket: config.s3Bucket,
    prefix: config.s3Prefix,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    forcePathStyle: config.s3ForcePathStyle,
  });
  const createIfMissing = input.createIfMissing !== false;
  const allowOverwrite = input.allowOverwrite === true;
  const startedAt = Date.now();

  const manifestJson = await getTextFromS3({
    client,
    bucket: config.s3Bucket,
    key: input.backupPath,
  });
  const manifest = parseBackupManifest(manifestJson);
  if (manifest.databaseId !== input.databaseId) {
    throw new Error("Backup does not belong to this database");
  }

  const targetBranchName =
    input.targetBranchName?.trim() || manifest.sourceTargetName;
  let target = await getTargetByName({
    databaseId: input.databaseId,
    targetName: targetBranchName,
  });
  let createdBranch = false;

  if (target) {
    if (!allowOverwrite) {
      throw new Error("Restore overwrite requires confirmation");
    }
  } else {
    if (!createIfMissing) {
      throw new Error("Target branch does not exist");
    }
    target = (await createDatabaseTarget({
      databaseId: input.databaseId,
      name: targetBranchName,
      sourceTargetName: "main",
    })) as DatabaseTargetRow;
    createdBranch = true;
  }

  const activeTarget = await ensureTargetActive({
    databaseId: input.databaseId,
    target,
  });

  const tempDir = await mkdtemp(join(tmpdir(), "frost-postgres-restore-"));
  try {
    const dumpContent = await getBufferFromS3({
      client,
      bucket: config.s3Bucket,
      key: manifest.dumpKey,
    });
    const dumpFilePath = join(tempDir, "restore.pgdump");
    await writeFile(dumpFilePath, dumpContent);

    let globalsFilePath: string | null = null;
    if (manifest.globalsKey) {
      const globalsContent = await getTextFromS3({
        client,
        bucket: config.s3Bucket,
        key: manifest.globalsKey,
      });
      globalsFilePath = join(tempDir, "restore-globals.sql");
      await writeFile(globalsFilePath, globalsContent, "utf8");
    }

    const warnings = await restoreIntoTarget({
      target: activeTarget,
      dumpFilePath,
      globalsFilePath,
    });
    const finishedAt = Date.now();

    return {
      databaseId: input.databaseId,
      sourceTargetName: manifest.sourceTargetName,
      targetBranchName: activeTarget.name,
      targetId: activeTarget.id,
      createdBranch,
      startedAt,
      finishedAt,
      warnings,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
