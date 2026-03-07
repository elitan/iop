import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Selectable } from "kysely";
import { decrypt, encrypt } from "./crypto";
import { getDatabaseBranchInternalHost } from "./database-hostname";
import { createDatabase, startDatabaseTarget } from "./database-runtime";
import { db } from "./db";
import type {
  DatabaseImportJobs,
  Databases,
  DatabaseTargets,
} from "./db-types";
import { newDatabaseImportJobId } from "./id";

type DatabaseImportStage =
  | "source"
  | "preflight"
  | "target"
  | "importing"
  | "imported"
  | "verifying"
  | "ready-for-cutover"
  | "completed"
  | "failed";

type DatabaseImportStrategy = "dump-restore" | "logical-replication";
type DatabaseImportCheckStatus = "ok" | "warning" | "blocked";
type DatabaseImportVerifyStatus = "pass" | "warning" | "failed";
type DatabaseImportWriteActivity = "quiet" | "active";

interface ParsedSourceUrl {
  host: string;
  clientHost: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
  addHostGateway: boolean;
  unsupportedParams: string[];
}

export interface DatabaseImportCheckResult {
  key: string;
  label: string;
  status: DatabaseImportCheckStatus;
  message: string;
}

export interface DatabaseImportSourceSummary {
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string;
  serverVersion: string | null;
  estimatedDowntimeMinutes: number | null;
  sizeBytes: number | null;
  tableCount: number | null;
  extensionNames: string[];
  owner: string | null;
  currentUser: string | null;
  activeConnectionCount: number | null;
  longRunningConnectionCount: number | null;
  activeWriteConnectionCount: number | null;
  writeActivity: DatabaseImportWriteActivity | null;
  unsupportedExtensions: string[];
}

export interface DatabaseImportVerifyCheck {
  key: string;
  label: string;
  status: DatabaseImportVerifyStatus;
  message: string;
}

export interface DatabaseImportVerifyResult {
  status: DatabaseImportVerifyStatus;
  checks: DatabaseImportVerifyCheck[];
  comparedAt: number | null;
}

export interface DatabaseImportTargetConnection {
  databaseId: string;
  targetId: string;
  internalHost: string;
  hostPort: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface DatabaseImportJobView {
  id: string;
  projectId: string;
  databaseId: string | null;
  targetName: string;
  engine: "postgres";
  strategy: DatabaseImportStrategy;
  stage: DatabaseImportStage;
  progressStep: string | null;
  sourceSummary: DatabaseImportSourceSummary;
  checkResults: DatabaseImportCheckResult[];
  verifyResult: DatabaseImportVerifyResult;
  logText: string;
  errorMessage: string | null;
  cutoverConfirmedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  createdAt: number;
  updatedAt: number;
  targetConnection: DatabaseImportTargetConnection | null;
}

type DatabaseImportRow = Selectable<DatabaseImportJobs>;

interface DatabaseTargetProviderRef {
  containerName: string;
  hostPort: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  image: string;
  port: number;
}

interface ImportCommandResult {
  stdout: string;
  stderr: string;
}

interface DatabaseImportJobUpdate {
  databaseId?: string | null;
  targetName?: string;
  engine?: "postgres";
  strategy?: DatabaseImportStrategy;
  sourceUrlEncrypted?: string | null;
  sourceHost?: string;
  sourcePort?: number;
  sourceDatabase?: string;
  sourceUsername?: string;
  sourceSslMode?: string;
  stage?: DatabaseImportStage;
  progressStep?: string | null;
  sourceSummaryJson?: string;
  checkResultsJson?: string;
  verifyResultJson?: string;
  logText?: string;
  errorMessage?: string | null;
  cutoverConfirmedAt?: number | null;
  completedAt?: number | null;
  failedAt?: number | null;
  createdAt?: number;
}

const IMPORT_LOG_LIMIT = 200000;
const PREVIEW_TARGET_VERSION_MIN = 13;
const TARGET_READY_MAX_ATTEMPTS = 60;
const TARGET_READY_DELAY_MS = 1000;
const activeImportJobs = new Set<string>();
const activeVerifyJobs = new Set<string>();
const supportedExtensionsPromises = new Map<string, Promise<Set<string>>>();

function getDefaultPostgresImage(): string {
  return process.env.FROST_POSTGRES_IMAGE ?? "postgres:16";
}

function getPostgresImageForVersion(versionMajor: number | null): string {
  if (versionMajor === null) {
    return getDefaultPostgresImage();
  }

  return `postgres:${versionMajor}`;
}

function isAllowedSslMode(value: string): boolean {
  return [
    "disable",
    "allow",
    "prefer",
    "require",
    "verify-ca",
    "verify-full",
  ].includes(value);
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function emptySourceSummary(): DatabaseImportSourceSummary {
  return {
    host: "",
    port: 5432,
    database: "",
    username: "",
    sslMode: "prefer",
    serverVersion: null,
    estimatedDowntimeMinutes: null,
    sizeBytes: null,
    tableCount: null,
    extensionNames: [],
    owner: null,
    currentUser: null,
    activeConnectionCount: null,
    longRunningConnectionCount: null,
    activeWriteConnectionCount: null,
    writeActivity: null,
    unsupportedExtensions: [],
  };
}

function emptyVerifyResult(): DatabaseImportVerifyResult {
  return {
    status: "pass",
    checks: [],
    comparedAt: null,
  };
}

function parseSourceUrl(sourceUrl: string): ParsedSourceUrl {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("Source URL is invalid");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Source URL must use postgres:// or postgresql://");
  }

  const host = parsed.hostname.trim();
  const database = decodeURIComponent(
    parsed.pathname.replace(/^\//, "").trim(),
  );
  const username = decodeURIComponent(parsed.username.trim());
  const password = decodeURIComponent(parsed.password);
  const sslMode = parsed.searchParams.get("sslmode")?.trim() ?? "prefer";
  const unsupportedParams = [
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslpassword",
  ].filter(function hasUnsupportedParam(key) {
    return parsed.searchParams.has(key);
  });

  if (!host) {
    throw new Error("Source URL must include a host");
  }
  if (!database) {
    throw new Error("Source URL must include a database name");
  }
  if (!username) {
    throw new Error("Source URL must include a username");
  }
  if (!password) {
    throw new Error("Source URL must include a password");
  }
  if (!isAllowedSslMode(sslMode)) {
    throw new Error("Source URL uses an unsupported sslmode");
  }

  const addHostGateway =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  return {
    host,
    clientHost: addHostGateway ? "host.docker.internal" : host,
    port: parsed.port.trim().length > 0 ? Number(parsed.port) : 5432,
    database,
    username,
    password,
    sslMode,
    addHostGateway,
    unsupportedParams,
  };
}

function getSourceSummaryFromParsedUrl(
  parsed: ParsedSourceUrl,
): DatabaseImportSourceSummary {
  return {
    ...emptySourceSummary(),
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    username: parsed.username,
    sslMode: parsed.sslMode,
  };
}

function parseDatabaseTargetProviderRef(
  providerRefJson: string,
): DatabaseTargetProviderRef {
  const value = JSON.parse(
    providerRefJson,
  ) as Partial<DatabaseTargetProviderRef>;

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
    throw new Error("Invalid database target");
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

function getEstimatedDowntimeMinutes(input: {
  sizeBytes: number;
  tableCount: number;
}): number {
  const sizeGb = input.sizeBytes / (1024 * 1024 * 1024);
  const minutes = Math.ceil(sizeGb * 4 + input.tableCount / 200 + 2);
  return Math.max(2, minutes);
}

function parseVersionMajor(version: string | null): number | null {
  if (!version) {
    return null;
  }
  const match = version.match(/^(\d+)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function getSourceImageFromSummary(
  sourceSummary: DatabaseImportSourceSummary,
): string {
  return getPostgresImageForVersion(
    parseVersionMajor(sourceSummary.serverVersion),
  );
}

function getWriteActivityLabel(
  activeWriteConnectionCount: number,
): DatabaseImportWriteActivity {
  return activeWriteConnectionCount > 0 ? "active" : "quiet";
}

function getImportProgressStepForRestoreLine(line: string): string | null {
  const normalized = line.toLowerCase();
  if (
    normalized.includes("creating schema") ||
    normalized.includes("creating table") ||
    normalized.includes("creating sequence") ||
    normalized.includes("creating function") ||
    normalized.includes("creating type")
  ) {
    return "schema";
  }
  if (
    normalized.includes("processing data for table") ||
    normalized.includes("copying") ||
    normalized.includes("copy ")
  ) {
    return "data";
  }
  if (
    normalized.includes("creating index") ||
    normalized.includes("creating constraint") ||
    normalized.includes("creating trigger")
  ) {
    return "indexes";
  }
  return null;
}

function truncateLogText(value: string): string {
  if (value.length <= IMPORT_LOG_LIMIT) {
    return value;
  }
  return value.slice(value.length - IMPORT_LOG_LIMIT);
}

async function sleep(ms: number): Promise<void> {
  await new Promise(function wait(resolve) {
    setTimeout(resolve, ms);
  });
}

function buildSourceDockerArgs(
  parsed: ParsedSourceUrl,
  clientArgs: string[],
  image: string,
): string[] {
  const args = ["run", "--rm"];

  if (parsed.addHostGateway) {
    args.push("--add-host", "host.docker.internal:host-gateway");
  }

  args.push(
    "-e",
    `PGPASSWORD=${parsed.password}`,
    "-e",
    `PGSSLMODE=${parsed.sslMode}`,
    "-e",
    "PGCONNECT_TIMEOUT=10",
    "-e",
    "PGAPPNAME=frost-import",
    image,
    ...clientArgs,
  );

  return args;
}

function buildSourcePsqlArgs(
  parsed: ParsedSourceUrl,
  sql: string,
  image = getDefaultPostgresImage(),
): string[] {
  return buildSourceDockerArgs(
    parsed,
    [
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      parsed.clientHost,
      "-p",
      String(parsed.port),
      "-U",
      parsed.username,
      "-d",
      parsed.database,
      "-t",
      "-A",
      "-c",
      sql,
    ],
    image,
  );
}

function buildSourcePgDumpArgs(
  parsed: ParsedSourceUrl,
  image: string,
): string[] {
  return buildSourceDockerArgs(
    parsed,
    [
      "pg_dump",
      "-h",
      parsed.clientHost,
      "-p",
      String(parsed.port),
      "-U",
      parsed.username,
      "-d",
      parsed.database,
      "-Fc",
      "--no-owner",
      "--no-privileges",
      "--verbose",
    ],
    image,
  );
}

function buildSourcePgDumpPreflightArgs(
  parsed: ParsedSourceUrl,
  image: string,
): string[] {
  return buildSourceDockerArgs(
    parsed,
    [
      "pg_dump",
      "-h",
      parsed.clientHost,
      "-p",
      String(parsed.port),
      "-U",
      parsed.username,
      "-d",
      parsed.database,
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "-f",
      "/dev/null",
    ],
    image,
  );
}

function buildTargetPsqlArgs(
  providerRef: DatabaseTargetProviderRef,
  database: string,
  sql: string,
): string[] {
  return [
    "exec",
    "-e",
    `PGPASSWORD=${providerRef.password}`,
    providerRef.containerName,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    "127.0.0.1",
    "-U",
    providerRef.username,
    "-d",
    database,
    "-t",
    "-A",
    "-c",
    sql,
  ];
}

function buildTargetPgRestoreArgs(
  providerRef: DatabaseTargetProviderRef,
  remoteDumpPath: string,
): string[] {
  return [
    "exec",
    "-e",
    `PGPASSWORD=${providerRef.password}`,
    providerRef.containerName,
    "pg_restore",
    "-h",
    "127.0.0.1",
    "-U",
    providerRef.username,
    "-d",
    providerRef.database,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--verbose",
    remoteDumpPath,
  ];
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildQualifiedName(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function buildTableKey(schema: string, name: string): string {
  return `${schema}.${name}`;
}

async function runCommand(
  args: string[],
  options?: {
    stdoutFilePath?: string;
    onStdoutLine?: (line: string) => void;
    onStderrLine?: (line: string) => void;
  },
): Promise<ImportCommandResult> {
  return await new Promise(function runCommandPromise(resolve, reject) {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutFileStream = options?.stdoutFilePath
      ? createWriteStream(options.stdoutFilePath)
      : null;

    const stdoutReader = createInterface({
      input: child.stdout,
    });
    stdoutReader.on("line", function onStdoutLine(line) {
      if (options?.onStdoutLine) {
        options.onStdoutLine(line);
      }
    });

    const stderrReader = createInterface({
      input: child.stderr,
    });
    stderrReader.on("line", function onStderrLine(line) {
      if (options?.onStderrLine) {
        options.onStderrLine(line);
      }
    });

    child.stdout.on("data", function onStdoutData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutChunks.push(buffer);
      if (stdoutFileStream) {
        stdoutFileStream.write(buffer);
      }
    });

    child.stderr.on("data", function onStderrData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrChunks.push(buffer);
    });

    child.on("error", function onError(error) {
      stdoutReader.close();
      stderrReader.close();
      if (stdoutFileStream) {
        stdoutFileStream.end();
      }
      reject(error);
    });

    child.on("close", function onClose(code) {
      stdoutReader.close();
      stderrReader.close();
      const finalize = function finalize(): void {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(stderr || stdout || "command failed"));
      };

      if (stdoutFileStream) {
        stdoutFileStream.end(finalize);
        return;
      }

      finalize();
    });
  });
}

function createJobLogger(jobId: string): {
  appendLine: (line: string) => void;
  appendBlock: (value: string) => Promise<void>;
  flush: () => Promise<void>;
} {
  let buffer: string[] = [];
  let flushChain = Promise.resolve();

  function queueFlush(force: boolean): void {
    if (!force && buffer.length < 20) {
      return;
    }

    const lines = buffer;
    buffer = [];

    if (lines.length === 0) {
      return;
    }

    flushChain = flushChain.then(function flushBufferedLines() {
      return appendImportLog(jobId, lines.join("\n"));
    });
  }

  return {
    appendLine: function appendLine(line: string): void {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      buffer.push(trimmed);
      queueFlush(false);
    },
    appendBlock: async function appendBlock(value: string): Promise<void> {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      buffer.push(trimmed);
      queueFlush(true);
      await flushChain;
    },
    flush: async function flush(): Promise<void> {
      queueFlush(true);
      await flushChain;
    },
  };
}

async function getImportJobRow(jobId: string): Promise<DatabaseImportRow> {
  const row = await db
    .selectFrom("databaseImportJobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!row) {
    throw new Error("Import job not found");
  }

  return row;
}

async function getImportTargetConnection(
  databaseId: string | null,
): Promise<DatabaseImportTargetConnection | null> {
  if (!databaseId) {
    return null;
  }

  const [database, target] = await Promise.all([
    db
      .selectFrom("databases")
      .selectAll()
      .where("id", "=", databaseId)
      .executeTakeFirst(),
    db
      .selectFrom("databaseTargets")
      .selectAll()
      .where("databaseId", "=", databaseId)
      .where("name", "=", "main")
      .executeTakeFirst(),
  ]);

  if (!database || !target) {
    return null;
  }

  const providerRef = parseDatabaseTargetProviderRef(target.providerRefJson);

  return {
    databaseId,
    targetId: target.id,
    internalHost: getDatabaseBranchInternalHost(database.name, target.hostname),
    hostPort: providerRef.hostPort,
    username: providerRef.username,
    password: providerRef.password,
    database: providerRef.database,
    ssl: providerRef.ssl,
  };
}

async function toJobView(
  row: DatabaseImportRow,
): Promise<DatabaseImportJobView> {
  return {
    id: row.id,
    projectId: row.projectId,
    databaseId: row.databaseId,
    targetName: row.targetName,
    engine: row.engine,
    strategy: row.strategy,
    stage: row.stage,
    progressStep: row.progressStep,
    sourceSummary: safeJsonParse<DatabaseImportSourceSummary>(
      row.sourceSummaryJson,
      emptySourceSummary(),
    ),
    checkResults: safeJsonParse<DatabaseImportCheckResult[]>(
      row.checkResultsJson,
      [],
    ),
    verifyResult: safeJsonParse<DatabaseImportVerifyResult>(
      row.verifyResultJson,
      emptyVerifyResult(),
    ),
    logText: row.logText,
    errorMessage: row.errorMessage,
    cutoverConfirmedAt: row.cutoverConfirmedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    targetConnection: await getImportTargetConnection(row.databaseId),
  };
}

async function appendImportLog(jobId: string, text: string): Promise<void> {
  const row = await getImportJobRow(jobId);
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const nextLog = truncateLogText(
    row.logText.length > 0 ? `${row.logText}\n${trimmed}` : trimmed,
  );

  await db
    .updateTable("databaseImportJobs")
    .set({
      logText: nextLog,
      updatedAt: Date.now(),
    })
    .where("id", "=", jobId)
    .execute();
}

async function updateImportJob(
  jobId: string,
  updates: DatabaseImportJobUpdate,
): Promise<void> {
  await db
    .updateTable("databaseImportJobs")
    .set({
      ...updates,
      updatedAt: Date.now(),
    })
    .where("id", "=", jobId)
    .execute();
}

async function markImportFailed(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await appendImportLog(jobId, `ERROR: ${message}`);
  await updateImportJob(jobId, {
    stage: "failed",
    progressStep: null,
    errorMessage: message,
    failedAt: Date.now(),
  });
}

async function getSourceUrlForJob(jobId: string): Promise<string> {
  const row = await getImportJobRow(jobId);
  if (!row.sourceUrlEncrypted) {
    throw new Error("Source credentials are no longer available for this job");
  }
  return decrypt(row.sourceUrlEncrypted);
}

async function getDatabaseForImportJob(
  jobId: string,
): Promise<Selectable<Databases>> {
  const row = await getImportJobRow(jobId);
  if (!row.databaseId) {
    throw new Error("Import target has not been created");
  }

  const database = await db
    .selectFrom("databases")
    .selectAll()
    .where("id", "=", row.databaseId)
    .executeTakeFirst();

  if (!database) {
    throw new Error("Target database not found");
  }

  return database;
}

async function getMainTargetForDatabase(
  databaseId: string,
): Promise<Selectable<DatabaseTargets>> {
  const target = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", databaseId)
    .where("name", "=", "main")
    .executeTakeFirst();

  if (!target) {
    throw new Error("Target database branch not found");
  }

  return target;
}

async function ensureMainTargetIsRunning(
  databaseId: string,
): Promise<DatabaseTargetProviderRef> {
  let target = await getMainTargetForDatabase(databaseId);

  if (target.lifecycleStatus !== "active") {
    await startDatabaseTarget({
      databaseId,
      targetId: target.id,
    });
    target = await getMainTargetForDatabase(databaseId);
  }

  const providerRef = parseDatabaseTargetProviderRef(target.providerRefJson);
  await waitForTargetReady(providerRef);
  return providerRef;
}

async function waitForTargetReady(
  providerRef: DatabaseTargetProviderRef,
): Promise<void> {
  for (let attempt = 1; attempt <= TARGET_READY_MAX_ATTEMPTS; attempt += 1) {
    try {
      await runCommand([
        "exec",
        "-e",
        `PGPASSWORD=${providerRef.password}`,
        providerRef.containerName,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        providerRef.username,
        "-d",
        providerRef.database,
      ]);
      return;
    } catch {
      if (attempt >= TARGET_READY_MAX_ATTEMPTS) {
        break;
      }
      await sleep(TARGET_READY_DELAY_MS);
    }
  }

  throw new Error("Target database did not become ready");
}

async function querySourceJson<T>(
  parsed: ParsedSourceUrl,
  sql: string,
  image = getDefaultPostgresImage(),
): Promise<T> {
  const result = await runCommand(buildSourcePsqlArgs(parsed, sql, image));

  if (!result.stdout) {
    throw new Error("Source query returned no data");
  }

  return JSON.parse(result.stdout) as T;
}

async function queryTargetJson<T>(
  providerRef: DatabaseTargetProviderRef,
  database: string,
  sql: string,
): Promise<T> {
  const result = await runCommand(
    buildTargetPsqlArgs(providerRef, database, sql),
  );

  if (!result.stdout) {
    throw new Error("Target query returned no data");
  }

  return JSON.parse(result.stdout) as T;
}

async function listSupportedExtensions(image: string): Promise<Set<string>> {
  const existingPromise = supportedExtensionsPromises.get(image);
  if (existingPromise) {
    return await existingPromise;
  }

  const nextPromise = (async function resolveSupportedExtensions() {
    const result = await runCommand([
      "run",
      "--rm",
      image,
      "sh",
      "-lc",
      'find /usr/local/share/postgresql /usr/share/postgresql -path "*/extension/*.control" -print 2>/dev/null | while read -r f; do basename "$f" .control; done | sort -u',
    ]);

    const extensionNames = result.stdout
      .split("\n")
      .map(function trimLine(line) {
        return line.trim();
      })
      .filter(function hasValue(line) {
        return line.length > 0;
      });

    return new Set(extensionNames);
  })();

  supportedExtensionsPromises.set(image, nextPromise);
  return await nextPromise;
}

async function buildPreflight(input: {
  projectId: string;
  targetName: string;
  sourceUrl: string;
}): Promise<{
  parsed: ParsedSourceUrl;
  sourceSummary: DatabaseImportSourceSummary;
  checkResults: DatabaseImportCheckResult[];
}> {
  const parsed = parseSourceUrl(input.sourceUrl);
  const sourceSummary = getSourceSummaryFromParsedUrl(parsed);
  const checkResults: DatabaseImportCheckResult[] = [];

  if (parsed.unsupportedParams.length > 0) {
    checkResults.push({
      key: "ssl-files",
      label: "SSL config",
      status: "blocked",
      message: `Unsupported SSL params: ${parsed.unsupportedParams.join(", ")}`,
    });

    return {
      parsed,
      sourceSummary,
      checkResults,
    };
  }

  const existingDatabase = await db
    .selectFrom("databases")
    .select("id")
    .where("projectId", "=", input.projectId)
    .where("name", "=", input.targetName)
    .executeTakeFirst();

  checkResults.push({
    key: "target-name",
    label: "Target name",
    status: existingDatabase ? "blocked" : "ok",
    message: existingDatabase
      ? "A database with this name already exists in Frost"
      : "Target name is available",
  });

  try {
    const summary = await querySourceJson<{
      serverVersion: string;
      database: string;
      owner: string | null;
      currentUser: string | null;
      sizeBytes: number;
      tableCount: number;
      activeConnectionCount: number;
      longRunningConnectionCount: number;
      activeWriteConnectionCount: number;
    }>(
      parsed,
      `
        SELECT json_build_object(
          'serverVersion', current_setting('server_version'),
          'database', current_database(),
          'owner', (
            SELECT pg_catalog.pg_get_userbyid(datdba)
            FROM pg_database
            WHERE datname = current_database()
          ),
          'currentUser', current_user,
          'sizeBytes', pg_database_size(current_database()),
          'tableCount', (
            SELECT count(*)
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
              AND table_type = 'BASE TABLE'
          ),
          'activeConnectionCount', (
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
          ),
          'longRunningConnectionCount', (
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND now() - coalesce(xact_start, query_start, backend_start) > interval '5 minutes'
          ),
          'activeWriteConnectionCount', (
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state = 'active'
              AND query ~* '^(insert|update|delete|copy|alter|create|drop|truncate)'
          )
        )::text;
      `,
    );

    const extensionNames = await querySourceJson<string[]>(
      parsed,
      `
        SELECT coalesce(json_agg(extname ORDER BY extname), '[]'::json)::text
        FROM pg_extension;
      `,
    );

    sourceSummary.serverVersion = summary.serverVersion;
    sourceSummary.database = summary.database;
    sourceSummary.owner = summary.owner;
    sourceSummary.currentUser = summary.currentUser;
    sourceSummary.sizeBytes = summary.sizeBytes;
    sourceSummary.tableCount = summary.tableCount;
    sourceSummary.activeConnectionCount = summary.activeConnectionCount;
    sourceSummary.longRunningConnectionCount =
      summary.longRunningConnectionCount;
    sourceSummary.activeWriteConnectionCount =
      summary.activeWriteConnectionCount;
    sourceSummary.writeActivity = getWriteActivityLabel(
      summary.activeWriteConnectionCount,
    );
    sourceSummary.extensionNames = extensionNames;
    sourceSummary.estimatedDowntimeMinutes = getEstimatedDowntimeMinutes({
      sizeBytes: summary.sizeBytes,
      tableCount: summary.tableCount,
    });

    checkResults.push({
      key: "connectivity",
      label: "Connectivity",
      status: "ok",
      message: "Frost can reach and read the source database",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to source";
    checkResults.push({
      key: "connectivity",
      label: "Connectivity",
      status: "blocked",
      message,
    });

    return {
      parsed,
      sourceSummary,
      checkResults,
    };
  }

  const versionMajor = parseVersionMajor(sourceSummary.serverVersion);
  const sourceImage = getPostgresImageForVersion(versionMajor);
  checkResults.push({
    key: "version",
    label: "Postgres version",
    status:
      versionMajor !== null && versionMajor >= PREVIEW_TARGET_VERSION_MIN
        ? "ok"
        : "blocked",
    message:
      versionMajor !== null && versionMajor >= PREVIEW_TARGET_VERSION_MIN
        ? `Postgres ${sourceSummary.serverVersion} is supported`
        : `Postgres ${sourceSummary.serverVersion ?? "unknown"} is not supported`,
  });

  try {
    await runCommand(buildSourcePgDumpPreflightArgs(parsed, sourceImage));
    checkResults.push({
      key: "dump-access",
      label: "Dump access",
      status: "ok",
      message: "Source credentials can run pg_dump",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "pg_dump failed against source";
    checkResults.push({
      key: "dump-access",
      label: "Dump access",
      status: "blocked",
      message,
    });
  }

  const supportedExtensions = await listSupportedExtensions(sourceImage);
  const unsupportedExtensions = sourceSummary.extensionNames.filter(
    function isUnsupported(extensionName) {
      if (extensionName === "plpgsql") {
        return false;
      }
      return !supportedExtensions.has(extensionName);
    },
  );
  sourceSummary.unsupportedExtensions = unsupportedExtensions;

  checkResults.push({
    key: "extensions",
    label: "Extensions",
    status: unsupportedExtensions.length === 0 ? "ok" : "blocked",
    message:
      unsupportedExtensions.length === 0
        ? "Source extensions are available in Frost"
        : `Unsupported extensions: ${unsupportedExtensions.join(", ")}`,
  });

  checkResults.push({
    key: "activity",
    label: "Write activity",
    status:
      (sourceSummary.activeWriteConnectionCount ?? 0) > 0 ? "warning" : "ok",
    message:
      (sourceSummary.activeWriteConnectionCount ?? 0) > 0
        ? `${sourceSummary.activeWriteConnectionCount ?? 0} active write connection(s) detected`
        : "No active write connections detected",
  });

  checkResults.push({
    key: "long-running",
    label: "Long-running connections",
    status:
      (sourceSummary.longRunningConnectionCount ?? 0) > 0 ? "warning" : "ok",
    message:
      (sourceSummary.longRunningConnectionCount ?? 0) > 0
        ? `${sourceSummary.longRunningConnectionCount ?? 0} long-running connection(s) detected`
        : "No long-running connections detected",
  });

  return {
    parsed,
    sourceSummary,
    checkResults,
  };
}

function hasBlockedChecks(checkResults: DatabaseImportCheckResult[]): boolean {
  return checkResults.some(function hasBlockedCheck(checkResult) {
    return checkResult.status === "blocked";
  });
}

export async function createDatabaseImportJob(input: {
  projectId: string;
  targetName: string;
  sourceUrl: string;
}): Promise<DatabaseImportJobView> {
  const targetName = input.targetName.trim();
  if (!targetName) {
    throw new Error("Target name is required");
  }

  const now = Date.now();
  const jobId = newDatabaseImportJobId();
  const preflight = await buildPreflight({
    projectId: input.projectId,
    targetName,
    sourceUrl: input.sourceUrl,
  });
  const stage: DatabaseImportStage = hasBlockedChecks(preflight.checkResults)
    ? "failed"
    : "preflight";
  const errorMessage = stage === "failed" ? "Preflight checks failed" : null;

  await db
    .insertInto("databaseImportJobs")
    .values({
      id: jobId,
      projectId: input.projectId,
      databaseId: null,
      targetName,
      engine: "postgres",
      strategy: "dump-restore",
      sourceUrlEncrypted: encrypt(input.sourceUrl),
      sourceHost: preflight.parsed.host,
      sourcePort: preflight.parsed.port,
      sourceDatabase: preflight.parsed.database,
      sourceUsername: preflight.parsed.username,
      sourceSslMode: preflight.parsed.sslMode,
      stage,
      progressStep: null,
      sourceSummaryJson: JSON.stringify(preflight.sourceSummary),
      checkResultsJson: JSON.stringify(preflight.checkResults),
      verifyResultJson: JSON.stringify(emptyVerifyResult()),
      logText:
        stage === "failed"
          ? "Preflight failed. Fix the blocked checks and try again."
          : "Preflight passed. Create the Frost target to continue.",
      errorMessage,
      cutoverConfirmedAt: null,
      completedAt: null,
      failedAt: stage === "failed" ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return await getDatabaseImportJob(jobId);
}

export async function getDatabaseImportJob(
  jobId: string,
): Promise<DatabaseImportJobView> {
  const row = await getImportJobRow(jobId);
  return await toJobView(row);
}

export async function listDatabaseImportJobs(input: {
  databaseId: string;
}): Promise<DatabaseImportJobView[]> {
  const rows = await db
    .selectFrom("databaseImportJobs")
    .selectAll()
    .where("databaseId", "=", input.databaseId)
    .orderBy("createdAt", "desc")
    .execute();

  return await Promise.all(
    rows.map(function mapRow(row) {
      return toJobView(row);
    }),
  );
}

export async function createDatabaseImportTarget(
  jobId: string,
): Promise<DatabaseImportJobView> {
  const job = await getImportJobRow(jobId);
  const sourceSummary = safeJsonParse<DatabaseImportSourceSummary>(
    job.sourceSummaryJson,
    emptySourceSummary(),
  );

  if (job.stage !== "preflight" && job.stage !== "failed") {
    if (job.databaseId) {
      return await toJobView(job);
    }
    throw new Error("Import target cannot be created from the current step");
  }

  if (hasBlockedChecks(safeJsonParse(job.checkResultsJson, []))) {
    throw new Error("Fix blocked checks before creating the target");
  }

  if (job.databaseId) {
    return await getDatabaseImportJob(jobId);
  }

  await updateImportJob(jobId, {
    stage: "target",
    progressStep: "create-target",
    errorMessage: null,
    failedAt: null,
  });

  try {
    const created = await createDatabase({
      projectId: job.projectId,
      name: job.targetName,
      engine: "postgres",
      image: getSourceImageFromSummary(sourceSummary),
    });

    await appendImportLog(
      jobId,
      `Created Frost target database ${created.database.name}.`,
    );
    await updateImportJob(jobId, {
      databaseId: created.database.id,
      stage: "target",
      progressStep: null,
      errorMessage: null,
    });
  } catch (error) {
    await markImportFailed(jobId, error);
  }

  return await getDatabaseImportJob(jobId);
}

async function exportSourceDump(input: {
  parsed: ParsedSourceUrl;
  sourceImage: string;
  dumpFilePath: string;
  logger: ReturnType<typeof createJobLogger>;
}): Promise<void> {
  await runCommand(buildSourcePgDumpArgs(input.parsed, input.sourceImage), {
    stdoutFilePath: input.dumpFilePath,
    onStderrLine: function onStderrLine(line) {
      input.logger.appendLine(line);
    },
  });
}

async function copyFileToTargetContainer(input: {
  providerRef: DatabaseTargetProviderRef;
  localFilePath: string;
  remoteFilePath: string;
}): Promise<void> {
  await runCommand([
    "cp",
    input.localFilePath,
    `${input.providerRef.containerName}:${input.remoteFilePath}`,
  ]);
}

async function removeRemoteFile(input: {
  providerRef: DatabaseTargetProviderRef;
  remoteFilePath: string;
}): Promise<void> {
  await runCommand([
    "exec",
    input.providerRef.containerName,
    "rm",
    "-f",
    input.remoteFilePath,
  ]).catch(function ignore() {});
}

async function restoreDumpIntoTarget(input: {
  providerRef: DatabaseTargetProviderRef;
  dumpFilePath: string;
  logger: ReturnType<typeof createJobLogger>;
  onStep: (step: string) => Promise<void>;
}): Promise<void> {
  const remoteDumpPath = `/tmp/frost-import-${Date.now()}.pgdump`;

  try {
    await runCommand(
      buildTargetPsqlArgs(
        input.providerRef,
        "postgres",
        `DROP DATABASE IF EXISTS ${quoteIdentifier(input.providerRef.database)};`,
      ),
    );
    await runCommand(
      buildTargetPsqlArgs(
        input.providerRef,
        "postgres",
        `CREATE DATABASE ${quoteIdentifier(input.providerRef.database)};`,
      ),
    );

    await copyFileToTargetContainer({
      providerRef: input.providerRef,
      localFilePath: input.dumpFilePath,
      remoteFilePath: remoteDumpPath,
    });

    let currentStep = "schema";
    await input.onStep(currentStep);

    await runCommand(
      buildTargetPgRestoreArgs(input.providerRef, remoteDumpPath),
      {
        onStderrLine: function onStderrLine(line) {
          input.logger.appendLine(line);
          const nextStep = getImportProgressStepForRestoreLine(line);
          if (nextStep && nextStep !== currentStep) {
            currentStep = nextStep;
            void input.onStep(nextStep);
          }
        },
      },
    );

    await input.onStep("finalize");
  } finally {
    await removeRemoteFile({
      providerRef: input.providerRef,
      remoteFilePath: remoteDumpPath,
    });
  }
}

async function listUserTablesFromSource(
  parsed: ParsedSourceUrl,
  image: string,
): Promise<Array<{ schemaName: string; tableName: string }>> {
  return await querySourceJson<
    Array<{ schemaName: string; tableName: string }>
  >(
    parsed,
    `
      SELECT coalesce(
        json_agg(
          json_build_object(
            'schemaName', table_schema,
            'tableName', table_name
          )
          ORDER BY table_schema, table_name
        ),
        '[]'::json
      )::text
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema');
    `,
    image,
  );
}

async function listUserTablesFromTarget(
  providerRef: DatabaseTargetProviderRef,
): Promise<Array<{ schemaName: string; tableName: string }>> {
  return await queryTargetJson<
    Array<{ schemaName: string; tableName: string }>
  >(
    providerRef,
    providerRef.database,
    `
      SELECT coalesce(
        json_agg(
          json_build_object(
            'schemaName', table_schema,
            'tableName', table_name
          )
          ORDER BY table_schema, table_name
        ),
        '[]'::json
      )::text
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema');
    `,
  );
}

async function getSourceTableCount(
  parsed: ParsedSourceUrl,
  schemaName: string,
  tableName: string,
  image: string,
): Promise<number> {
  const result = await runCommand(
    buildSourcePsqlArgs(
      parsed,
      `SELECT count(*)::text FROM ${buildQualifiedName(schemaName, tableName)};`,
      image,
    ),
  );
  return Number(result.stdout || "0");
}

async function getTargetTableCount(
  providerRef: DatabaseTargetProviderRef,
  schemaName: string,
  tableName: string,
): Promise<number> {
  const result = await runCommand(
    buildTargetPsqlArgs(
      providerRef,
      providerRef.database,
      `SELECT count(*)::text FROM ${buildQualifiedName(schemaName, tableName)};`,
    ),
  );
  return Number(result.stdout || "0");
}

async function listSourceSequences(
  parsed: ParsedSourceUrl,
  image: string,
): Promise<Array<{ sequenceKey: string; lastValue: string | null }>> {
  return await querySourceJson<
    Array<{ sequenceKey: string; lastValue: string | null }>
  >(
    parsed,
    `
      SELECT coalesce(
        json_agg(
          json_build_object(
            'sequenceKey', schemaname || '.' || sequencename,
            'lastValue', last_value::text
          )
          ORDER BY schemaname, sequencename
        ),
        '[]'::json
      )::text
      FROM pg_sequences
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
    `,
    image,
  );
}

async function listTargetSequences(
  providerRef: DatabaseTargetProviderRef,
): Promise<Array<{ sequenceKey: string; lastValue: string | null }>> {
  return await queryTargetJson<
    Array<{ sequenceKey: string; lastValue: string | null }>
  >(
    providerRef,
    providerRef.database,
    `
      SELECT coalesce(
        json_agg(
          json_build_object(
            'sequenceKey', schemaname || '.' || sequencename,
            'lastValue', last_value::text
          )
          ORDER BY schemaname, sequencename
        ),
        '[]'::json
      )::text
      FROM pg_sequences
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
    `,
  );
}

async function listTargetExtensions(
  providerRef: DatabaseTargetProviderRef,
): Promise<string[]> {
  return await queryTargetJson<string[]>(
    providerRef,
    providerRef.database,
    `
      SELECT coalesce(json_agg(extname ORDER BY extname), '[]'::json)::text
      FROM pg_extension;
    `,
  );
}

function compareStringArrays(
  left: string[],
  right: string[],
): { matches: boolean; missing: string[]; extra: string[] } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  const missing = left.filter(function filterMissing(value) {
    return !rightSet.has(value);
  });
  const extra = right.filter(function filterExtra(value) {
    return !leftSet.has(value);
  });

  return {
    matches: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

function compareSequenceLists(
  left: Array<{ sequenceKey: string; lastValue: string | null }>,
  right: Array<{ sequenceKey: string; lastValue: string | null }>,
): { matches: boolean; mismatches: string[] } {
  const rightMap = new Map(
    right.map(function toEntry(item) {
      return [item.sequenceKey, item.lastValue] as const;
    }),
  );

  const mismatches = left
    .filter(function hasMismatch(item) {
      return rightMap.get(item.sequenceKey) !== item.lastValue;
    })
    .map(function toKey(item) {
      return item.sequenceKey;
    });

  return {
    matches: mismatches.length === 0,
    mismatches,
  };
}

async function verifyImport(
  jobId: string,
): Promise<DatabaseImportVerifyResult> {
  const sourceUrl = await getSourceUrlForJob(jobId);
  const parsed = parseSourceUrl(sourceUrl);
  const sourceSummary = safeJsonParse<DatabaseImportSourceSummary>(
    (await getImportJobRow(jobId)).sourceSummaryJson,
    emptySourceSummary(),
  );
  const sourceImage = getSourceImageFromSummary(sourceSummary);
  const database = await getDatabaseForImportJob(jobId);
  const providerRef = await ensureMainTargetIsRunning(database.id);
  const checks: DatabaseImportVerifyCheck[] = [];

  const sourceTables = await listUserTablesFromSource(parsed, sourceImage);
  const targetTables = await listUserTablesFromTarget(providerRef);
  const sourceTableKeys = sourceTables.map(function toKey(table) {
    return buildTableKey(table.schemaName, table.tableName);
  });
  const targetTableKeys = targetTables.map(function toKey(table) {
    return buildTableKey(table.schemaName, table.tableName);
  });
  const tableCompare = compareStringArrays(sourceTableKeys, targetTableKeys);

  checks.push({
    key: "tables",
    label: "Tables",
    status: tableCompare.matches ? "pass" : "failed",
    message: tableCompare.matches
      ? `${sourceTableKeys.length} table(s) match`
      : `Table mismatch. Missing: ${tableCompare.missing.join(", ") || "none"}; extra: ${tableCompare.extra.join(", ") || "none"}`,
  });

  const rowCountMismatches: string[] = [];
  if (tableCompare.matches) {
    for (const table of sourceTables) {
      const sourceCount = await getSourceTableCount(
        parsed,
        table.schemaName,
        table.tableName,
        sourceImage,
      );
      const targetCount = await getTargetTableCount(
        providerRef,
        table.schemaName,
        table.tableName,
      );
      if (sourceCount !== targetCount) {
        rowCountMismatches.push(
          `${buildTableKey(table.schemaName, table.tableName)} (${sourceCount} -> ${targetCount})`,
        );
      }
    }
  }

  checks.push({
    key: "row-counts",
    label: "Row counts",
    status:
      tableCompare.matches && rowCountMismatches.length === 0
        ? "pass"
        : "failed",
    message: !tableCompare.matches
      ? "Skipped because table lists do not match"
      : rowCountMismatches.length === 0
        ? "All table row counts match"
        : `Row count mismatch in ${rowCountMismatches.join(", ")}`,
  });

  const sourceSequences = await listSourceSequences(parsed, sourceImage);
  const targetSequences = await listTargetSequences(providerRef);
  const sequenceCompare = compareSequenceLists(
    sourceSequences,
    targetSequences,
  );

  checks.push({
    key: "sequences",
    label: "Sequences",
    status: sequenceCompare.matches ? "pass" : "failed",
    message: sequenceCompare.matches
      ? "Sequence positions match"
      : `Sequence mismatch in ${sequenceCompare.mismatches.join(", ")}`,
  });

  const targetExtensions = await listTargetExtensions(providerRef);
  const extensionCompare = compareStringArrays(
    sourceSummary.extensionNames,
    targetExtensions,
  );

  checks.push({
    key: "extensions",
    label: "Extensions",
    status: extensionCompare.matches ? "pass" : "failed",
    message: extensionCompare.matches
      ? "Extensions match"
      : `Extension mismatch. Missing: ${extensionCompare.missing.join(", ") || "none"}; extra: ${extensionCompare.extra.join(", ") || "none"}`,
  });

  const failedChecks = checks.filter(function isFailed(check) {
    return check.status === "failed";
  });
  const warningChecks = checks.filter(function isWarning(check) {
    return check.status === "warning";
  });

  return {
    status:
      failedChecks.length > 0
        ? "failed"
        : warningChecks.length > 0
          ? "warning"
          : "pass",
    checks,
    comparedAt: Date.now(),
  };
}

export async function runDatabaseImportJob(jobId: string): Promise<void> {
  const logger = createJobLogger(jobId);
  const job = await getImportJobRow(jobId);
  const sourceUrl = await getSourceUrlForJob(jobId);
  const parsed = parseSourceUrl(sourceUrl);
  const sourceSummary = safeJsonParse<DatabaseImportSourceSummary>(
    job.sourceSummaryJson,
    emptySourceSummary(),
  );
  const sourceImage = getSourceImageFromSummary(sourceSummary);
  const database = await getDatabaseForImportJob(jobId);
  const providerRef = await ensureMainTargetIsRunning(database.id);
  const tempDir = await mkdtemp(join(tmpdir(), "frost-import-"));
  const dumpFilePath = join(tempDir, "source.pgdump");

  try {
    await logger.appendBlock(
      `Starting import from ${parsed.host}:${parsed.port}/${parsed.database}.`,
    );
    await updateImportJob(jobId, {
      stage: "importing",
      progressStep: "export",
      errorMessage: null,
      failedAt: null,
      verifyResultJson: JSON.stringify(emptyVerifyResult()),
    });

    await exportSourceDump({
      parsed,
      sourceImage,
      dumpFilePath,
      logger,
    });
    await logger.flush();

    await restoreDumpIntoTarget({
      providerRef,
      dumpFilePath,
      logger,
      onStep: async function onStep(step) {
        await updateImportJob(jobId, {
          progressStep: step,
        });
      },
    });
    await logger.flush();

    await appendImportLog(jobId, "Import finished. Ready to verify.");
    await updateImportJob(jobId, {
      stage: "imported",
      progressStep: null,
      errorMessage: null,
    });

    activeVerifyJobs.add(jobId);
    await runDatabaseImportVerifyJob(jobId);
  } catch (error) {
    await logger.flush();
    await markImportFailed(jobId, error);
  } finally {
    activeImportJobs.delete(jobId);
    await rm(tempDir, { recursive: true, force: true }).catch(
      function ignore() {},
    );
  }
}

export async function runDatabaseImportVerifyJob(jobId: string): Promise<void> {
  try {
    await appendImportLog(jobId, "Starting verification.");
    await updateImportJob(jobId, {
      stage: "verifying",
      progressStep: "tables",
      errorMessage: null,
      failedAt: null,
    });

    const verifyResult = await verifyImport(jobId);

    if (verifyResult.status === "failed") {
      await appendImportLog(jobId, "Verification failed.");
      await updateImportJob(jobId, {
        stage: "failed",
        progressStep: null,
        errorMessage: "Verification failed",
        failedAt: Date.now(),
        verifyResultJson: JSON.stringify(verifyResult),
      });
      return;
    }

    const now = Date.now();
    await appendImportLog(jobId, "Verification passed. Import completed.");
    await updateImportJob(jobId, {
      stage: "completed",
      progressStep: null,
      errorMessage: null,
      cutoverConfirmedAt: null,
      completedAt: now,
      sourceUrlEncrypted: null,
      verifyResultJson: JSON.stringify(verifyResult),
    });
  } catch (error) {
    await markImportFailed(jobId, error);
  } finally {
    activeVerifyJobs.delete(jobId);
  }
}

export async function triggerDatabaseImport(
  jobId: string,
): Promise<DatabaseImportJobView> {
  let job = await getImportJobRow(jobId);

  if (!job.databaseId) {
    const createdTargetJob = await createDatabaseImportTarget(jobId);
    if (!createdTargetJob.databaseId) {
      throw new Error(
        createdTargetJob.errorMessage ?? "Failed to create Frost target",
      );
    }
    job = await getImportJobRow(jobId);
  }
  if (activeImportJobs.has(jobId)) {
    return await getDatabaseImportJob(jobId);
  }
  if (job.stage === "verifying") {
    throw new Error("Verification is already running");
  }

  activeImportJobs.add(jobId);
  void runDatabaseImportJob(jobId);
  return await getDatabaseImportJob(jobId);
}

export async function triggerDatabaseImportVerify(
  jobId: string,
): Promise<DatabaseImportJobView> {
  const job = await getImportJobRow(jobId);

  if (!job.databaseId) {
    throw new Error("Create the Frost target before verifying");
  }
  if (job.stage !== "imported" && job.stage !== "failed") {
    if (job.stage === "ready-for-cutover" || job.stage === "completed") {
      return await toJobView(job);
    }
    throw new Error("Run the import before verifying");
  }
  if (activeVerifyJobs.has(jobId)) {
    return await toJobView(job);
  }

  activeVerifyJobs.add(jobId);
  void runDatabaseImportVerifyJob(jobId);
  return await getDatabaseImportJob(jobId);
}

export async function markDatabaseImportCutover(
  jobId: string,
): Promise<DatabaseImportJobView> {
  const job = await getImportJobRow(jobId);

  if (job.stage !== "ready-for-cutover") {
    throw new Error("Import is not ready for cutover");
  }

  const now = Date.now();
  await appendImportLog(jobId, "Cutover confirmed.");
  await updateImportJob(jobId, {
    stage: "completed",
    progressStep: null,
    cutoverConfirmedAt: now,
    completedAt: now,
    sourceUrlEncrypted: null,
    errorMessage: null,
  });

  return await getDatabaseImportJob(jobId);
}
