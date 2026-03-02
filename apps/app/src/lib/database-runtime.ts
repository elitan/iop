import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { Selectable } from "kysely";
import { nanoid } from "nanoid";
import { getDatabaseBranchAlias } from "./database-hostname";
import {
  type DatabaseProvider,
  normalizeDatabaseProvider,
} from "./database-provider";
import {
  startDatabaseTargetGateway,
  stopDatabaseTargetGateway,
} from "./database-target-gateway";
import { db } from "./db";
import type {
  Databases,
  DatabaseTargetDeployments,
  DatabaseTargets,
  Environments,
} from "./db-types";
import {
  connectContainerToNetwork,
  createNetwork,
  disconnectContainerFromNetwork,
  getAvailablePort,
  isPortConflictError,
  runContainer,
  stopContainer,
  waitForHealthy,
} from "./docker";
import {
  newDatabaseId,
  newDatabaseTargetDeploymentId,
  newDatabaseTargetId,
  newRuntimeServiceId,
} from "./id";
import type { BranchStorageBackendName } from "./postgres-branching/branch-storage-backend";
import {
  assertPostgresBranchingReady,
  buildResetTempStorageRef,
  checkpointPostgresTargetIfRunning,
  clonePostgresStorageForTarget,
  createPostgresPrimaryStorage,
  createRollbackStack,
  getPostgresStorageMetadata,
  removePostgresStorage,
  resolvePostgresStorageMountPath,
  swapPostgresStorageFromStaged,
} from "./postgres-branching/postgres-branch-runtime";
import { shellEscape } from "./shell-escape";
import { slugify } from "./slugify";

const execAsync = promisify(exec);

export type DatabaseEngine = "postgres" | "mysql";
export type DatabaseTargetKind = "branch" | "instance";
export type DatabaseTargetLifecycle = "active" | "stopped" | "expired";
export type DatabaseTargetDeploymentAction =
  | "create"
  | "deploy"
  | "reset"
  | "start"
  | "stop";
export type DatabaseTargetDeploymentStatus = "running" | "failed" | "stopped";

interface ProviderRef {
  containerName: string;
  hostPort: number;
  runtimeHostPort?: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  image: string;
  port: number;
  memoryLimit: string | null;
  cpuLimit: number | null;
  storageBackend?: BranchStorageBackendName;
  storageRef?: string;
}

export interface RuntimeConnection {
  hostPort: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface DatabaseWithTarget {
  database: Selectable<Databases>;
  target: Selectable<DatabaseTargets>;
}

export interface DatabaseTargetRuntimeInfo {
  targetId: string;
  name: string;
  hostname: string;
  runtimeServiceId: string;
  lifecycleStatus: DatabaseTargetLifecycle;
  containerName: string;
  hostPort: number;
  runtimeHostPort: number;
  gatewayEnabled: boolean;
  image: string;
  port: number;
  storageBackend: BranchStorageBackendName | null;
  memoryLimit: string | null;
  cpuLimit: number | null;
  ttlValue: number | null;
  ttlUnit: "hours" | "days" | null;
  scaleToZeroMinutes: number | null;
  lastActivityAt: number | null;
  createdAt: number;
}

export interface DatabaseTargetSqlResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
  command: string | null;
  output: string;
  executedAt: number;
}

const DATABASE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;
const TARGET_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;
const MEMORY_LIMIT_PATTERN = /^\d+[kmg]$/i;
const POSTGRES_QUERY_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const TARGET_ACTIVITY_WRITE_THROTTLE_MS = 5000;

const targetActivityWriteAt = new Map<string, number>();

function randomSecret(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeDockerName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (sanitized.length === 0) {
    return `frost-db-${nanoid(8).toLowerCase()}`;
  }
  if (sanitized.length <= 63) {
    return sanitized;
  }
  return sanitized.slice(0, 63).replace(/-+$/g, "");
}

function assertName(name: string, pattern: RegExp, label: string): void {
  if (!pattern.test(name)) {
    throw new Error(
      `${label} must use lowercase letters, numbers, and hyphens only`,
    );
  }
}

export function assertDatabaseName(name: string): void {
  assertName(name, DATABASE_NAME_PATTERN, "Database name");
}

export function assertTargetName(name: string): void {
  assertName(name, TARGET_NAME_PATTERN, "Target name");
}

export function assertTargetHostname(name: string): void {
  assertName(name, TARGET_NAME_PATTERN, "Hostname");
}

function assertMemoryLimit(value: string): void {
  if (!MEMORY_LIMIT_PATTERN.test(value)) {
    throw new Error("Memory limit must look like 512m or 1g");
  }
}

function getProvider(engine: DatabaseEngine): DatabaseProvider {
  return engine === "postgres" ? "postgres-docker" : "mysql-docker";
}

function getTargetKind(engine: DatabaseEngine): DatabaseTargetKind {
  return engine === "postgres" ? "branch" : "instance";
}

function getDefaultImage(engine: DatabaseEngine): string {
  if (engine === "postgres") {
    return process.env.FROST_POSTGRES_IMAGE ?? "postgres:16";
  }
  return process.env.FROST_MYSQL_IMAGE ?? "mysql:8.4";
}

function getDefaultPort(engine: DatabaseEngine): number {
  return engine === "postgres" ? 5432 : 3306;
}

function getDatabaseNameSlug(name: string): string {
  const normalized = slugify(name).replace(/-/g, "_");
  const base = normalized.length > 0 ? normalized : "frostdb";
  return base.slice(0, 48);
}

async function assertPostgresHostReady(): Promise<void> {
  try {
    await execAsync("docker info --format '{{.ServerVersion}}'");
  } catch {
    throw new Error(
      "Postgres requires a Docker host. Docker is not available.",
    );
  }
}

function normalizeDatabase(
  database: Selectable<Databases>,
): Selectable<Databases> {
  return {
    ...database,
    provider: normalizeDatabaseProvider(database.provider),
  };
}

function parseProviderRef(json: string): ProviderRef {
  const value = JSON.parse(json) as Partial<ProviderRef>;
  const hasStorageBackend = typeof value.storageBackend === "string";
  const hasStorageRef = typeof value.storageRef === "string";

  if (hasStorageBackend !== hasStorageRef) {
    throw new Error("Invalid provider reference");
  }

  if (
    hasStorageBackend &&
    value.storageBackend !== "apfs" &&
    value.storageBackend !== "zfs"
  ) {
    throw new Error("Invalid provider reference");
  }

  if (
    !value ||
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
  if (
    value.runtimeHostPort !== undefined &&
    typeof value.runtimeHostPort !== "number"
  ) {
    throw new Error("Invalid provider reference");
  }
  return {
    containerName: value.containerName,
    hostPort: value.hostPort,
    runtimeHostPort: value.runtimeHostPort,
    username: value.username,
    password: value.password,
    database: value.database,
    ssl: value.ssl,
    image: value.image,
    port: value.port,
    memoryLimit:
      typeof value.memoryLimit === "string" ? value.memoryLimit : null,
    cpuLimit: typeof value.cpuLimit === "number" ? value.cpuLimit : null,
    storageBackend: hasStorageBackend ? value.storageBackend : undefined,
    storageRef: hasStorageRef ? value.storageRef : undefined,
  };
}

function toProviderRefJson(value: ProviderRef): string {
  return JSON.stringify(value);
}

function applyProviderRefStorage(
  providerRef: ProviderRef,
  storage: {
    storageBackend: BranchStorageBackendName;
    storageRef: string;
  },
): void {
  providerRef.storageBackend = storage.storageBackend;
  providerRef.storageRef = storage.storageRef;
}

function getTargetRuntimeHostPort(
  target: Pick<DatabaseTargets, "runtimeHostPort">,
  providerRef: ProviderRef,
): number {
  if (target.runtimeHostPort !== null) {
    return target.runtimeHostPort;
  }
  if (providerRef.runtimeHostPort !== undefined) {
    return providerRef.runtimeHostPort;
  }
  return providerRef.hostPort;
}

function applyProviderRefRuntimePorts(input: {
  target: Pick<DatabaseTargets, "runtimeHostPort">;
  previousProviderRef: ProviderRef;
  nextProviderRef: ProviderRef;
}): void {
  if (
    input.target.runtimeHostPort === null &&
    input.previousProviderRef.runtimeHostPort === undefined
  ) {
    input.nextProviderRef.runtimeHostPort = undefined;
    return;
  }

  const runtimeHostPort = getTargetRuntimeHostPort(
    input.target,
    input.previousProviderRef,
  );
  input.nextProviderRef.hostPort = input.previousProviderRef.hostPort;
  input.nextProviderRef.runtimeHostPort = runtimeHostPort;
}

async function setTargetActivityAt(
  targetId: string,
  activityAt: number,
): Promise<void> {
  await db
    .updateTable("databaseTargets")
    .set({ lastActivityAt: activityAt })
    .where("id", "=", targetId)
    .execute();
}

function queueTargetActivityWrite(targetId: string): void {
  const now = Date.now();
  const lastWriteAt = targetActivityWriteAt.get(targetId) ?? 0;
  if (now - lastWriteAt < TARGET_ACTIVITY_WRITE_THROTTLE_MS) {
    return;
  }
  targetActivityWriteAt.set(targetId, now);
  setTargetActivityAt(targetId, now).catch(function onError() {});
}

function clearTargetActivityWrite(targetId: string): void {
  targetActivityWriteAt.delete(targetId);
}

async function recordTargetDeployment(input: {
  targetId: string;
  action: DatabaseTargetDeploymentAction;
  status: DatabaseTargetDeploymentStatus;
  message?: string | null;
}): Promise<Selectable<DatabaseTargetDeployments>> {
  const id = newDatabaseTargetDeploymentId();
  const now = Date.now();

  await db
    .insertInto("databaseTargetDeployments")
    .values({
      id,
      targetId: input.targetId,
      action: input.action,
      status: input.status,
      message: input.message ?? null,
      createdAt: now,
      finishedAt: now,
    })
    .execute();

  const deployment = await db
    .selectFrom("databaseTargetDeployments")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!deployment) {
    throw new Error("Failed to create target deployment");
  }

  return deployment;
}

async function waitForPostgresReady(providerRef: ProviderRef): Promise<void> {
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    try {
      await execAsync(
        `docker exec ${shellEscape(providerRef.containerName)} pg_isready -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d ${shellEscape(providerRef.database)}`,
      );
      return;
    } catch {}

    await sleep(1000);
  }

  throw new Error(
    `Postgres target ${providerRef.containerName} did not become ready`,
  );
}

function parsePostgresRow(
  row: string,
  fieldSeparator: string,
  nullToken: string,
): string[] {
  return row
    .split(fieldSeparator)
    .map((value) => (value === nullToken ? "NULL" : value));
}

function parsePostgresQueryOutput(input: {
  output: string;
  fieldSeparator: string;
  rowSeparator: string;
  nullToken: string;
}): {
  columns: string[];
  rows: string[][];
  rowCount: number;
  command: string | null;
} {
  const normalizedOutput = input.output.replace(/\r/g, "");

  if (normalizedOutput.length === 0) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      command: null,
    };
  }

  if (!normalizedOutput.includes(input.rowSeparator)) {
    const command = normalizedOutput.trim();
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      command: command.length > 0 ? command : null,
    };
  }

  const chunks = normalizedOutput
    .split(input.rowSeparator)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  if (chunks.length === 0) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      command: null,
    };
  }

  const columns = parsePostgresRow(
    chunks[0],
    input.fieldSeparator,
    input.nullToken,
  );
  const rows = chunks
    .slice(1)
    .map((row) => parsePostgresRow(row, input.fieldSeparator, input.nullToken));

  return {
    columns,
    rows,
    rowCount: rows.length,
    command: null,
  };
}

async function updateTargetContainerResources(input: {
  containerName: string;
  memoryLimit?: string;
  cpuLimit?: number;
}): Promise<void> {
  const args: string[] = [];
  if (input.memoryLimit !== undefined) {
    assertMemoryLimit(input.memoryLimit);
    args.push(`--memory ${shellEscape(input.memoryLimit)}`);
    args.push(`--memory-swap ${shellEscape(input.memoryLimit)}`);
  }
  if (input.cpuLimit !== undefined) {
    args.push(`--cpus ${shellEscape(String(input.cpuLimit))}`);
  }
  if (args.length === 0) {
    return;
  }
  await execAsync(
    `docker update ${args.join(" ")} ${shellEscape(input.containerName)}`,
  );
}

async function createTargetRuntime(input: {
  databaseId: string;
  databaseName: string;
  targetName: string;
  runtimeServiceId: string;
  engine: DatabaseEngine;
  memoryLimit?: string | null;
  cpuLimit?: number | null;
  templateRef?: ProviderRef;
  fixedHostPort?: number;
  storageMountPath?: string;
}): Promise<ProviderRef> {
  const image = input.templateRef?.image ?? getDefaultImage(input.engine);
  const port = input.templateRef?.port ?? getDefaultPort(input.engine);
  const username = input.templateRef?.username ?? "frost";
  const password = input.templateRef?.password ?? randomSecret();
  const database =
    input.templateRef?.database ??
    `${getDatabaseNameSlug(input.databaseName)}_${input.targetName.replace(/-/g, "_")}`.slice(
      0,
      48,
    );
  const containerName = sanitizeDockerName(
    `frost-db-${input.databaseId}-${input.targetName}`,
  );
  const memoryLimit =
    input.memoryLimit ?? input.templateRef?.memoryLimit ?? null;
  const cpuLimit = input.cpuLimit ?? input.templateRef?.cpuLimit ?? null;
  const triedPorts = new Set<number>();
  const hostPortsToTry: number[] = [];

  await stopContainer(containerName);

  if (input.engine === "postgres" && !input.storageMountPath) {
    throw new Error("Postgres target is missing storage mount path");
  }

  const envVars: Record<string, string> =
    input.engine === "postgres"
      ? {
          POSTGRES_USER: username,
          POSTGRES_PASSWORD: password,
          POSTGRES_DB: database,
        }
      : {
          MYSQL_DATABASE: database,
          MYSQL_USER: username,
          MYSQL_PASSWORD: password,
          MYSQL_ROOT_PASSWORD: randomSecret(),
        };

  if (input.fixedHostPort !== undefined) {
    hostPortsToTry.push(input.fixedHostPort);
  } else {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const hostPort = await getAvailablePort(10000, 20000, triedPorts);
      triedPorts.add(hostPort);
      hostPortsToTry.push(hostPort);
    }
  }

  let lastPortConflictError = "";
  for (const hostPort of hostPortsToTry) {
    const runResult = await runContainer({
      imageName: image,
      hostPort,
      containerPort: port,
      name: containerName,
      envVars,
      memoryLimit: memoryLimit ?? undefined,
      cpuLimit: cpuLimit ?? undefined,
      volumes:
        input.engine === "postgres" && input.storageMountPath
          ? [{ name: input.storageMountPath, path: "/var/lib/postgresql/data" }]
          : undefined,
      labels: {
        "frost.managed": "true",
        "frost.service.id": input.runtimeServiceId,
        "frost.database.id": input.databaseId,
        "frost.database.target": input.targetName,
      },
    });

    if (!runResult.success) {
      const errorMessage =
        runResult.error || "Failed to start database target container";
      if (isPortConflictError(errorMessage)) {
        lastPortConflictError = errorMessage;
        await stopContainer(containerName);
        continue;
      }
      throw new Error(errorMessage);
    }

    const ready = await waitForHealthy({
      containerId: runResult.containerId,
      port: hostPort,
      timeoutSeconds: 90,
    });
    if (!ready) {
      await stopContainer(containerName);
      throw new Error("Database target failed health check");
    }

    const providerRef: ProviderRef = {
      containerName,
      hostPort,
      username,
      password,
      database,
      ssl: false,
      image,
      port,
      memoryLimit,
      cpuLimit,
    };

    return providerRef;
  }

  throw new Error(
    lastPortConflictError ||
      "Failed to start database target after port retries",
  );
}

async function recreateTargetRuntime(input: {
  database: Selectable<Databases>;
  target: Selectable<DatabaseTargets>;
  providerRef: ProviderRef;
  fixedHostPort?: number;
}): Promise<ProviderRef> {
  const storage =
    input.database.engine === "postgres"
      ? getPostgresStorageMetadata(input.providerRef)
      : undefined;
  const storageMountPath = storage
    ? await resolvePostgresStorageMountPath(storage)
    : undefined;

  const nextRef = await createTargetRuntime({
    databaseId: input.database.id,
    databaseName: input.database.name,
    targetName: input.target.name,
    runtimeServiceId: input.target.runtimeServiceId,
    engine: input.database.engine as DatabaseEngine,
    templateRef: input.providerRef,
    fixedHostPort: input.fixedHostPort ?? input.providerRef.hostPort,
    storageMountPath,
  });

  if (storage) {
    applyProviderRefStorage(nextRef, storage);
  }

  return nextRef;
}

async function resolveDatabaseWithTargetById(
  databaseId: string,
  targetId: string,
): Promise<DatabaseWithTarget> {
  const [database, target] = await Promise.all([
    db
      .selectFrom("databases")
      .selectAll()
      .where("id", "=", databaseId)
      .executeTakeFirst(),
    db
      .selectFrom("databaseTargets")
      .selectAll()
      .where("id", "=", targetId)
      .executeTakeFirst(),
  ]);

  if (!database || !target || target.databaseId !== database.id) {
    throw new Error("Database target not found");
  }

  return { database, target };
}

async function getDatabaseById(
  databaseId: string,
): Promise<Selectable<Databases>> {
  const database = await db
    .selectFrom("databases")
    .selectAll()
    .where("id", "=", databaseId)
    .executeTakeFirst();

  if (!database) {
    throw new Error("Database not found");
  }

  return normalizeDatabase(database);
}

async function getTargetById(
  targetId: string,
): Promise<Selectable<DatabaseTargets>> {
  const target = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("id", "=", targetId)
    .executeTakeFirst();

  if (!target) {
    throw new Error("Target not found");
  }

  return target;
}

async function getTargetByName(
  databaseId: string,
  targetName: string,
): Promise<Selectable<DatabaseTargets>> {
  const target = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", databaseId)
    .where("name", "=", targetName)
    .executeTakeFirst();

  if (!target) {
    throw new Error("Target not found");
  }

  return target;
}

function buildNetworkName(environment: Selectable<Environments>): string {
  return sanitizeDockerName(
    `frost-net-${environment.projectId}-${environment.id}`,
  );
}

function getBaseAliases(databaseName: string): string[] {
  return [databaseName, `${databaseName}.frost.internal`];
}

function getTargetAliases(input: {
  databaseName: string;
  targetHostname: string;
  includeBaseAliases: boolean;
}): string[] {
  const branchAlias = getDatabaseBranchAlias(
    input.databaseName,
    input.targetHostname,
  );
  const aliases = [branchAlias, `${branchAlias}.frost.internal`];
  if (input.includeBaseAliases) {
    aliases.push(...getBaseAliases(input.databaseName));
  }
  return aliases;
}

async function ensurePostgresDatabaseNetworkAttachment(input: {
  environment: Selectable<Environments>;
  database: Selectable<Databases>;
}): Promise<void> {
  const targets = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", input.database.id)
    .execute();

  if (targets.length === 0) {
    return;
  }

  const mainTargetId =
    targets.find((target) => target.name === "main")?.id ?? targets[0]?.id;

  const networkName = buildNetworkName(input.environment);
  await createNetwork(networkName, {
    "frost.managed": "true",
    "frost.project.id": input.environment.projectId,
  });

  for (const target of targets) {
    const providerRef = parseProviderRef(target.providerRefJson);
    await disconnectContainerFromNetwork(
      providerRef.containerName,
      networkName,
    );
  }

  for (const target of targets) {
    const providerRef = parseProviderRef(target.providerRefJson);
    await connectContainerToNetwork(
      providerRef.containerName,
      networkName,
      getTargetAliases({
        databaseName: input.database.name,
        targetHostname: target.hostname,
        includeBaseAliases: target.id === mainTargetId,
      }),
    );
  }
}

async function reconnectPostgresDatabaseNetwork(
  database: Selectable<Databases>,
): Promise<void> {
  if (database.engine !== "postgres") {
    return;
  }

  const environments = await db
    .selectFrom("environments")
    .selectAll()
    .where("projectId", "=", database.projectId)
    .execute();

  for (const environment of environments) {
    await ensurePostgresDatabaseNetworkAttachment({ environment, database });
  }
}

export async function ensureEnvironmentPostgresNetworkAccess(
  environmentId: string,
): Promise<void> {
  const environment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", environmentId)
    .executeTakeFirst();

  if (!environment) {
    throw new Error("Environment not found");
  }

  const databases = await db
    .selectFrom("databases")
    .selectAll()
    .where("projectId", "=", environment.projectId)
    .where("engine", "=", "postgres")
    .execute();

  for (const database of databases) {
    await ensurePostgresDatabaseNetworkAttachment({
      environment,
      database: normalizeDatabase(database),
    });
  }
}

function isScaleToZeroEnabled(
  target: Pick<DatabaseTargets, "scaleToZeroMinutes">,
): boolean {
  return target.scaleToZeroMinutes !== null;
}

async function ensureTargetGateway(targetId: string): Promise<void> {
  const target = await getTargetById(targetId);
  const providerRef = parseProviderRef(target.providerRefJson);

  if (!isScaleToZeroEnabled(target)) {
    await stopDatabaseTargetGateway(target.id);
    return;
  }

  if (target.runtimeHostPort === null) {
    throw new Error("Scale to zero target is missing runtime host port");
  }

  await startDatabaseTargetGateway({
    targetId: target.id,
    listenPort: providerRef.hostPort,
    ensureRunning: async function ensureRunning() {
      let current = await getTargetById(target.id);
      if (current.lifecycleStatus !== "active") {
        current = await startDatabaseTarget({
          databaseId: current.databaseId,
          targetId: current.id,
        });
      }
      const currentProviderRef = parseProviderRef(current.providerRefJson);
      return getTargetRuntimeHostPort(current, currentProviderRef);
    },
    onActivity: function onActivity() {
      queueTargetActivityWrite(target.id);
    },
  });
}

export async function restoreDatabaseTargetGateways(): Promise<void> {
  const targets = await db
    .selectFrom("databaseTargets")
    .innerJoin("databases", "databases.id", "databaseTargets.databaseId")
    .selectAll("databaseTargets")
    .where("databaseTargets.scaleToZeroMinutes", "is not", null)
    .where("databaseTargets.kind", "=", "branch")
    .where("databaseTargets.name", "!=", "main")
    .where("databases.engine", "=", "postgres")
    .execute();

  for (const target of targets) {
    try {
      await ensureTargetGateway(target.id);
    } catch (error) {
      console.error("[database-runtime] Failed to restore target gateway", {
        targetId: target.id,
        error,
      });
    }
  }
}

export async function createDatabase(input: {
  projectId: string;
  name: string;
  engine: DatabaseEngine;
}): Promise<DatabaseWithTarget> {
  assertDatabaseName(input.name);

  if (input.engine === "postgres") {
    await assertPostgresHostReady();
    await assertPostgresBranchingReady();
  }

  const existing = await db
    .selectFrom("databases")
    .select("id")
    .where("projectId", "=", input.projectId)
    .where("name", "=", input.name)
    .executeTakeFirst();

  if (existing) {
    throw new Error("Database with this name already exists");
  }

  const databaseId = newDatabaseId();
  const targetId = newDatabaseTargetId();
  const runtimeServiceId = newRuntimeServiceId();
  const createdAt = Date.now();
  const provider = getProvider(input.engine);
  const kind = getTargetKind(input.engine);

  await db
    .insertInto("databases")
    .values({
      id: databaseId,
      projectId: input.projectId,
      name: input.name,
      engine: input.engine,
      provider,
      createdAt,
    })
    .execute();

  const rollback = createRollbackStack();

  try {
    let storageMountPath: string | undefined;
    let postgresStorageHandle:
      | {
          storageBackend: BranchStorageBackendName;
          storageRef: string;
        }
      | undefined;

    if (input.engine === "postgres") {
      const storageHandle = await createPostgresPrimaryStorage({
        databaseId,
        targetId,
      });
      storageMountPath = storageHandle.mountPath;
      postgresStorageHandle = {
        storageBackend: storageHandle.storageBackend,
        storageRef: storageHandle.storageRef,
      };
      rollback.add(async () => {
        await removePostgresStorage({
          storageBackend: storageHandle.storageBackend,
          storageRef: storageHandle.storageRef,
        });
      });
    }

    const providerRef = await createTargetRuntime({
      databaseId,
      databaseName: input.name,
      targetName: "main",
      runtimeServiceId,
      engine: input.engine,
      storageMountPath,
    });
    rollback.add(async () => {
      await stopContainer(providerRef.containerName);
    });

    if (postgresStorageHandle) {
      applyProviderRefStorage(providerRef, postgresStorageHandle);
    }

    await db
      .insertInto("databaseTargets")
      .values({
        id: targetId,
        databaseId,
        name: "main",
        hostname: "main",
        kind,
        sourceTargetId: null,
        runtimeServiceId,
        lifecycleStatus: "active",
        providerRefJson: toProviderRefJson(providerRef),
        ttlValue: null,
        ttlUnit: null,
        scaleToZeroMinutes: null,
        lastActivityAt: createdAt,
        runtimeHostPort: null,
        createdAt,
      })
      .execute();

    await recordTargetDeployment({
      targetId,
      action: "create",
      status: "running",
      message: "Target created",
    });

    if (input.engine === "postgres") {
      const createdDatabase = await getDatabaseById(databaseId);
      await reconnectPostgresDatabaseNetwork(createdDatabase);
    }

    rollback.clear();
  } catch (error) {
    await rollback.run();
    await db.deleteFrom("databases").where("id", "=", databaseId).execute();
    throw error;
  }

  const database = await getDatabaseById(databaseId);
  const target = await getTargetById(targetId);
  return { database, target };
}

export async function createDatabaseTarget(input: {
  databaseId: string;
  name: string;
  sourceTargetName?: string;
}): Promise<Selectable<DatabaseTargets>> {
  assertTargetName(input.name);

  const database = await getDatabaseById(input.databaseId);

  const existing = await db
    .selectFrom("databaseTargets")
    .select("id")
    .where("databaseId", "=", input.databaseId)
    .where("name", "=", input.name)
    .executeTakeFirst();

  if (existing) {
    throw new Error("Target with this name already exists");
  }

  let sourceTarget: Selectable<DatabaseTargets> | null = null;
  if (database.engine === "postgres") {
    const sourceName = input.sourceTargetName ?? "main";
    sourceTarget = await getTargetByName(database.id, sourceName);
  }

  const createdAt = Date.now();
  const targetId = newDatabaseTargetId();
  const runtimeServiceId = newRuntimeServiceId();
  const rollback = createRollbackStack();

  try {
    let providerRef: ProviderRef;

    if (database.engine === "postgres") {
      if (!sourceTarget) {
        throw new Error("Source target is required for Postgres branching");
      }

      const sourceRef = parseProviderRef(sourceTarget.providerRefJson);
      const sourceStorage = getPostgresStorageMetadata(sourceRef);

      await checkpointPostgresTargetIfRunning({
        lifecycleStatus: sourceTarget.lifecycleStatus,
        providerRef: sourceRef,
      });

      const clonedStorage = await clonePostgresStorageForTarget({
        sourceStorage,
        databaseId: database.id,
        targetId,
      });

      rollback.add(async () => {
        await removePostgresStorage({
          storageBackend: clonedStorage.storageBackend,
          storageRef: clonedStorage.storageRef,
        });
      });

      providerRef = await createTargetRuntime({
        databaseId: database.id,
        databaseName: database.name,
        targetName: input.name,
        runtimeServiceId,
        engine: "postgres",
        templateRef: sourceRef,
        storageMountPath: clonedStorage.mountPath,
      });
      applyProviderRefStorage(providerRef, clonedStorage);
    } else {
      providerRef = await createTargetRuntime({
        databaseId: database.id,
        databaseName: database.name,
        targetName: input.name,
        runtimeServiceId,
        engine: database.engine as DatabaseEngine,
      });
    }

    rollback.add(async () => {
      await stopContainer(providerRef.containerName);
    });

    await db
      .insertInto("databaseTargets")
      .values({
        id: targetId,
        databaseId: database.id,
        name: input.name,
        hostname: input.name,
        kind: getTargetKind(database.engine as DatabaseEngine),
        sourceTargetId: sourceTarget?.id ?? null,
        runtimeServiceId,
        lifecycleStatus: "active",
        providerRefJson: toProviderRefJson(providerRef),
        ttlValue: null,
        ttlUnit: null,
        scaleToZeroMinutes: null,
        lastActivityAt: createdAt,
        runtimeHostPort: null,
        createdAt,
      })
      .execute();

    await recordTargetDeployment({
      targetId,
      action: "create",
      status: "running",
      message: "Target created",
    });

    rollback.clear();
  } catch (error) {
    await rollback.run();
    throw error;
  }

  const target = await getTargetById(targetId);
  if (database.engine === "postgres") {
    await reconnectPostgresDatabaseNetwork(database);
  }
  return target;
}

export async function resetDatabaseTarget(input: {
  databaseId: string;
  targetId: string;
  sourceTargetName: string;
}): Promise<Selectable<DatabaseTargets>> {
  const { database, target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );

  if (database.engine !== "postgres") {
    throw new Error("Reset is only available for Postgres targets");
  }
  if (target.name === "main") {
    throw new Error("main cannot be reset");
  }

  const sourceTarget = await getTargetByName(
    database.id,
    input.sourceTargetName,
  );
  const sourceRef = parseProviderRef(sourceTarget.providerRefJson);
  const currentRef = parseProviderRef(target.providerRefJson);
  const sourceStorage = getPostgresStorageMetadata(sourceRef);
  const currentStorage = getPostgresStorageMetadata(currentRef);
  const rollback = createRollbackStack();

  await checkpointPostgresTargetIfRunning({
    lifecycleStatus: sourceTarget.lifecycleStatus,
    providerRef: sourceRef,
  });

  const stagedStorageRef = buildResetTempStorageRef(database.id, target.id);
  const stagedStorage = await clonePostgresStorageForTarget({
    sourceStorage,
    databaseId: database.id,
    targetId: target.id,
    targetStorageRef: stagedStorageRef,
  });
  const stagedStorageMetadata = {
    storageBackend: stagedStorage.storageBackend,
    storageRef: stagedStorage.storageRef,
  };

  rollback.add(async () => {
    await removePostgresStorage(stagedStorageMetadata);
  });

  await stopContainer(currentRef.containerName);

  try {
    await swapPostgresStorageFromStaged({
      liveStorage: currentStorage,
      stagedStorage: stagedStorageMetadata,
    });
    rollback.clear();
  } catch (error) {
    await rollback.run();
    throw error;
  }

  const liveMountPath = await resolvePostgresStorageMountPath(currentStorage);
  const templateRef: ProviderRef = {
    ...sourceRef,
    image: currentRef.image,
    port: currentRef.port,
    memoryLimit: currentRef.memoryLimit,
    cpuLimit: currentRef.cpuLimit,
  };

  let nextRef: ProviderRef;
  try {
    nextRef = await createTargetRuntime({
      databaseId: database.id,
      databaseName: database.name,
      targetName: target.name,
      runtimeServiceId: target.runtimeServiceId,
      engine: "postgres",
      templateRef,
      fixedHostPort: getTargetRuntimeHostPort(target, currentRef),
      storageMountPath: liveMountPath,
    });
    await waitForPostgresReady(nextRef);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reset failed while starting";
    await db
      .updateTable("databaseTargets")
      .set({ lifecycleStatus: "stopped" })
      .where("id", "=", target.id)
      .execute();
    await recordTargetDeployment({
      targetId: target.id,
      action: "reset",
      status: "failed",
      message,
    });
    throw error;
  }

  applyProviderRefStorage(nextRef, currentStorage);
  applyProviderRefRuntimePorts({
    target,
    previousProviderRef: currentRef,
    nextProviderRef: nextRef,
  });

  await db
    .updateTable("databaseTargets")
    .set({
      sourceTargetId: sourceTarget.id,
      lifecycleStatus: "active",
      providerRefJson: toProviderRefJson(nextRef),
      lastActivityAt: Date.now(),
    })
    .where("id", "=", target.id)
    .execute();

  await recordTargetDeployment({
    targetId: target.id,
    action: "reset",
    status: "running",
    message: `Reset from ${input.sourceTargetName}`,
  });

  const updated = await getTargetById(target.id);
  await ensureTargetGateway(updated.id);
  await reconnectPostgresDatabaseNetwork(database);
  return updated;
}

export async function startDatabaseTarget(input: {
  databaseId: string;
  targetId: string;
}): Promise<Selectable<DatabaseTargets>> {
  const { database, target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );
  const providerRef = parseProviderRef(target.providerRefJson);
  const runtimeHostPort = getTargetRuntimeHostPort(target, providerRef);
  const nextRef = await recreateTargetRuntime({
    database,
    target,
    providerRef,
    fixedHostPort: runtimeHostPort,
  });
  if (database.engine === "postgres") {
    await waitForPostgresReady(nextRef);
  }
  applyProviderRefRuntimePorts({
    target,
    previousProviderRef: providerRef,
    nextProviderRef: nextRef,
  });

  await db
    .updateTable("databaseTargets")
    .set({
      lifecycleStatus: "active",
      providerRefJson: toProviderRefJson(nextRef),
      lastActivityAt: Date.now(),
    })
    .where("id", "=", target.id)
    .execute();

  await recordTargetDeployment({
    targetId: target.id,
    action: "start",
    status: "running",
    message: "Target started",
  });

  const updated = await getTargetById(target.id);
  await ensureTargetGateway(updated.id);
  await reconnectPostgresDatabaseNetwork(database);
  return updated;
}

export async function stopDatabaseTarget(input: {
  databaseId: string;
  targetId: string;
}): Promise<Selectable<DatabaseTargets>> {
  const { target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );
  const providerRef = parseProviderRef(target.providerRefJson);
  await stopContainer(providerRef.containerName);

  await db
    .updateTable("databaseTargets")
    .set({ lifecycleStatus: "stopped" })
    .where("id", "=", target.id)
    .execute();

  await recordTargetDeployment({
    targetId: target.id,
    action: "stop",
    status: "stopped",
    message: "Target stopped",
  });

  clearTargetActivityWrite(target.id);
  return getTargetById(target.id);
}

export async function deleteDatabaseTarget(input: {
  databaseId: string;
  targetId: string;
}): Promise<void> {
  const { database, target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );

  if (target.name === "main") {
    throw new Error("main target cannot be deleted");
  }

  await stopDatabaseTargetGateway(target.id);
  clearTargetActivityWrite(target.id);
  const providerRef = parseProviderRef(target.providerRefJson);
  await stopContainer(providerRef.containerName);
  if (database.engine === "postgres") {
    await removePostgresStorage(getPostgresStorageMetadata(providerRef));
  }
  await db.deleteFrom("databaseTargets").where("id", "=", target.id).execute();
}

export async function deleteDatabase(databaseId: string): Promise<void> {
  const database = await getDatabaseById(databaseId);
  const targets = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", database.id)
    .execute();

  for (const target of targets) {
    await stopDatabaseTargetGateway(target.id);
    clearTargetActivityWrite(target.id);
    const providerRef = parseProviderRef(target.providerRefJson);
    await stopContainer(providerRef.containerName);
    if (database.engine === "postgres") {
      await removePostgresStorage(getPostgresStorageMetadata(providerRef));
    }
  }

  await db.deleteFrom("databases").where("id", "=", database.id).execute();
}

export async function patchDatabase(input: {
  databaseId: string;
  name?: string;
}): Promise<Selectable<Databases>> {
  const database = await getDatabaseById(input.databaseId);
  let nextName: string | undefined;

  if (input.name !== undefined) {
    const name = input.name.trim();
    assertDatabaseName(name);

    const existing = await db
      .selectFrom("databases")
      .select("id")
      .where("projectId", "=", database.projectId)
      .where("name", "=", name)
      .where("id", "!=", database.id)
      .executeTakeFirst();

    if (existing) {
      throw new Error("Database with this name already exists");
    }

    nextName = name;
  }

  if (nextName === undefined) {
    return database;
  }

  await db
    .updateTable("databases")
    .set({
      name: nextName,
    })
    .where("id", "=", database.id)
    .execute();

  const updated = await getDatabaseById(database.id);
  if (updated.engine === "postgres") {
    await reconnectPostgresDatabaseNetwork(updated);
  }
  return updated;
}

export async function cleanupEnvironmentAttachments(
  environmentId: string,
): Promise<void> {
  await db
    .deleteFrom("environmentDatabaseAttachments")
    .where("environmentId", "=", environmentId)
    .execute();
}

export async function listDatabaseTargetDeployments(targetId: string) {
  await getTargetById(targetId);

  return db
    .selectFrom("databaseTargetDeployments")
    .selectAll()
    .where("targetId", "=", targetId)
    .orderBy("createdAt", "desc")
    .limit(30)
    .execute();
}

export async function deployDatabaseTarget(
  targetId: string,
): Promise<Selectable<DatabaseTargetDeployments>> {
  const target = await getTargetById(targetId);
  const database = await getDatabaseById(target.databaseId);
  const providerRef = parseProviderRef(target.providerRefJson);

  try {
    const runtimeHostPort = getTargetRuntimeHostPort(target, providerRef);
    const nextRef = await recreateTargetRuntime({
      database,
      target,
      providerRef,
      fixedHostPort: runtimeHostPort,
    });
    if (database.engine === "postgres") {
      await waitForPostgresReady(nextRef);
    }
    applyProviderRefRuntimePorts({
      target,
      previousProviderRef: providerRef,
      nextProviderRef: nextRef,
    });

    await db
      .updateTable("databaseTargets")
      .set({
        lifecycleStatus: "active",
        providerRefJson: toProviderRefJson(nextRef),
        lastActivityAt: Date.now(),
      })
      .where("id", "=", target.id)
      .execute();

    await ensureTargetGateway(target.id);
    if (database.engine === "postgres") {
      await reconnectPostgresDatabaseNetwork(database);
    }

    return recordTargetDeployment({
      targetId: target.id,
      action: "deploy",
      status: "running",
      message: "Target redeployed",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Target failed to redeploy";
    await db
      .updateTable("databaseTargets")
      .set({ lifecycleStatus: "stopped" })
      .where("id", "=", target.id)
      .execute();

    return recordTargetDeployment({
      targetId: target.id,
      action: "deploy",
      status: "failed",
      message,
    });
  }
}

export async function getDatabaseTargetRuntime(
  targetId: string,
): Promise<DatabaseTargetRuntimeInfo> {
  const target = await getTargetById(targetId);
  const providerRef = parseProviderRef(target.providerRefJson);

  return {
    targetId: target.id,
    name: target.name,
    hostname: target.hostname,
    runtimeServiceId: target.runtimeServiceId,
    lifecycleStatus: target.lifecycleStatus as DatabaseTargetLifecycle,
    containerName: providerRef.containerName,
    hostPort: providerRef.hostPort,
    runtimeHostPort: getTargetRuntimeHostPort(target, providerRef),
    gatewayEnabled: isScaleToZeroEnabled(target),
    image: providerRef.image,
    port: providerRef.port,
    storageBackend: providerRef.storageBackend ?? null,
    memoryLimit: providerRef.memoryLimit,
    cpuLimit: providerRef.cpuLimit,
    ttlValue: target.ttlValue,
    ttlUnit: target.ttlUnit,
    scaleToZeroMinutes: target.scaleToZeroMinutes,
    lastActivityAt: target.lastActivityAt,
    createdAt: target.createdAt,
  };
}

export async function runPostgresTargetSql(input: {
  targetId: string;
  sql: string;
}): Promise<DatabaseTargetSqlResult> {
  const target = await getTargetById(input.targetId);
  const database = await getDatabaseById(target.databaseId);

  if (database.engine !== "postgres") {
    throw new Error("SQL runner is only available for postgres targets");
  }

  if (target.lifecycleStatus !== "active") {
    throw new Error("Cannot run SQL while target is not active");
  }

  const sql = input.sql.trim();
  if (sql.length === 0) {
    throw new Error("SQL query cannot be empty");
  }

  const providerRef = parseProviderRef(target.providerRefJson);
  await waitForPostgresReady(providerRef);

  const fieldSeparator = "\u001f";
  const rowSeparator = "\u001e";
  const nullToken = "__FROST_SQL_NULL__";
  const command =
    `docker exec -e PGPASSWORD=${shellEscape(providerRef.password)} ${shellEscape(providerRef.containerName)} ` +
    `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U ${shellEscape(providerRef.username)} -d ${shellEscape(providerRef.database)} ` +
    `-A -F ${shellEscape(fieldSeparator)} -R ${shellEscape(rowSeparator)} ` +
    `-P footer=off -P null=${shellEscape(nullToken)} -c ${shellEscape(sql)}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: POSTGRES_QUERY_MAX_BUFFER_BYTES,
    });
    const parsed = parsePostgresQueryOutput({
      output: stdout,
      fieldSeparator,
      rowSeparator,
      nullToken,
    });
    const output = [stdout.trim(), stderr.trim()]
      .filter((value) => value.length > 0)
      .join("\n");

    return {
      ...parsed,
      output,
      executedAt: Date.now(),
    };
  } catch (error) {
    const maybeExecError = error as {
      stdout?: string;
      stderr?: string;
    };
    const stderr =
      typeof maybeExecError.stderr === "string"
        ? maybeExecError.stderr.trim()
        : "";
    const stdout =
      typeof maybeExecError.stdout === "string"
        ? maybeExecError.stdout.trim()
        : "";
    const message =
      stderr.length > 0
        ? stderr
        : stdout.length > 0
          ? stdout
          : error instanceof Error
            ? error.message
            : "SQL query failed";

    throw new Error(message);
  } finally {
    queueTargetActivityWrite(target.id);
  }
}

export async function patchDatabaseTargetRuntimeSettings(input: {
  targetId: string;
  name?: string;
  hostname?: string;
  lifecycleStatus?: "active" | "stopped";
  ttlValue?: number | null;
  ttlUnit?: "hours" | "days" | null;
  scaleToZeroMinutes?: number | null;
  memoryLimit?: string | null;
  cpuLimit?: number | null;
}): Promise<DatabaseTargetRuntimeInfo> {
  const target = await getTargetById(input.targetId);
  const database = await getDatabaseById(target.databaseId);
  let nextName = target.name;
  let nextHostname = target.hostname;

  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    assertTargetName(trimmedName);
    if (target.name === "main") {
      throw new Error("main cannot be renamed");
    }
    nextName = trimmedName;
  }

  if (input.hostname !== undefined) {
    const trimmedHostname = input.hostname.trim();
    assertTargetHostname(trimmedHostname);
    nextHostname = trimmedHostname;
  } else if (nextName !== target.name && target.hostname === target.name) {
    nextHostname = nextName;
  }

  const nameChanged = nextName !== target.name;
  const hostnameChanged = nextHostname !== target.hostname;

  if (nameChanged) {
    const existingName = await db
      .selectFrom("databaseTargets")
      .select("id")
      .where("databaseId", "=", target.databaseId)
      .where("name", "=", nextName)
      .executeTakeFirst();
    if (existingName) {
      throw new Error("Target with this name already exists");
    }
  }

  if (hostnameChanged) {
    const existingHostname = await db
      .selectFrom("databaseTargets")
      .select("id")
      .where("databaseId", "=", target.databaseId)
      .where("hostname", "=", nextHostname)
      .executeTakeFirst();
    if (existingHostname) {
      throw new Error("Target with this hostname already exists");
    }
  }

  if (nameChanged || hostnameChanged) {
    await db
      .updateTable("databaseTargets")
      .set({
        name: nextName,
        hostname: nextHostname,
      })
      .where("id", "=", target.id)
      .execute();
  }

  let nextTtlValue = target.ttlValue;
  let nextTtlUnit = target.ttlUnit;

  if (input.ttlValue !== undefined) {
    nextTtlValue = input.ttlValue;
  }
  if (input.ttlUnit !== undefined) {
    nextTtlUnit = input.ttlUnit;
  }
  if (input.ttlValue === null || input.ttlUnit === null) {
    nextTtlValue = null;
    nextTtlUnit = null;
  }
  if (
    (nextTtlValue === null && nextTtlUnit !== null) ||
    (nextTtlValue !== null && nextTtlUnit === null)
  ) {
    throw new Error("TTL value and unit must be set together");
  }
  if (nextTtlValue !== null && target.name === "main") {
    throw new Error("main cannot use TTL");
  }
  if (
    nextTtlValue !== null &&
    (database.engine !== "postgres" || target.kind !== "branch")
  ) {
    throw new Error("TTL is only available for postgres branches");
  }

  let nextScaleToZeroMinutes = target.scaleToZeroMinutes;
  if (input.scaleToZeroMinutes !== undefined) {
    nextScaleToZeroMinutes = input.scaleToZeroMinutes;
  }
  if (nextScaleToZeroMinutes !== null && target.name === "main") {
    throw new Error("main cannot use scale to zero");
  }
  if (
    nextScaleToZeroMinutes !== null &&
    (database.engine !== "postgres" || target.kind !== "branch")
  ) {
    throw new Error("Scale to zero is only available for postgres branches");
  }

  const scaleToZeroChanged =
    nextScaleToZeroMinutes !== target.scaleToZeroMinutes;

  if (input.memoryLimit === null || input.cpuLimit === null) {
    throw new Error("Clearing branch limits is not supported yet");
  }

  if (input.memoryLimit !== undefined || input.cpuLimit !== undefined) {
    const providerRef = parseProviderRef(target.providerRefJson);
    const nextMemoryLimit = input.memoryLimit ?? providerRef.memoryLimit;
    const nextCpuLimit = input.cpuLimit ?? providerRef.cpuLimit;
    const memoryLimit =
      input.memoryLimit === undefined
        ? undefined
        : (nextMemoryLimit ?? undefined);
    const cpuLimit =
      input.cpuLimit === undefined ? undefined : (nextCpuLimit ?? undefined);

    await updateTargetContainerResources({
      containerName: providerRef.containerName,
      memoryLimit,
      cpuLimit,
    });

    const nextProviderRef: ProviderRef = {
      ...providerRef,
      memoryLimit: nextMemoryLimit,
      cpuLimit: nextCpuLimit,
    };

    await db
      .updateTable("databaseTargets")
      .set({ providerRefJson: toProviderRefJson(nextProviderRef) })
      .where("id", "=", target.id)
      .execute();
  }

  if (scaleToZeroChanged) {
    const currentProviderRef = parseProviderRef(
      (await getTargetById(target.id)).providerRefJson,
    );
    if (nextScaleToZeroMinutes !== null) {
      let runtimeHostPort = target.runtimeHostPort;
      let nextProviderRef = currentProviderRef;

      if (runtimeHostPort === null) {
        runtimeHostPort = await getAvailablePort(
          10000,
          20000,
          new Set([currentProviderRef.hostPort]),
        );
      }

      if (target.lifecycleStatus === "active") {
        const recreated = await recreateTargetRuntime({
          database,
          target,
          providerRef: currentProviderRef,
          fixedHostPort: runtimeHostPort,
        });
        recreated.hostPort = currentProviderRef.hostPort;
        recreated.runtimeHostPort = runtimeHostPort;
        nextProviderRef = recreated;
      } else {
        nextProviderRef = {
          ...currentProviderRef,
          runtimeHostPort,
        };
      }

      await db
        .updateTable("databaseTargets")
        .set({
          providerRefJson: toProviderRefJson(nextProviderRef),
          runtimeHostPort,
          scaleToZeroMinutes: nextScaleToZeroMinutes,
          lastActivityAt: Date.now(),
        })
        .where("id", "=", target.id)
        .execute();

      await ensureTargetGateway(target.id);
    } else {
      await stopDatabaseTargetGateway(target.id);
      clearTargetActivityWrite(target.id);

      let nextProviderRef = currentProviderRef;
      if (target.lifecycleStatus === "active") {
        const recreated = await recreateTargetRuntime({
          database,
          target: {
            ...target,
            runtimeHostPort: null,
          },
          providerRef: currentProviderRef,
          fixedHostPort: currentProviderRef.hostPort,
        });
        recreated.runtimeHostPort = undefined;
        nextProviderRef = recreated;
      } else {
        nextProviderRef = {
          ...currentProviderRef,
          runtimeHostPort: undefined,
        };
      }

      await db
        .updateTable("databaseTargets")
        .set({
          providerRefJson: toProviderRefJson(nextProviderRef),
          runtimeHostPort: null,
          scaleToZeroMinutes: null,
        })
        .where("id", "=", target.id)
        .execute();
    }
  } else if (nextScaleToZeroMinutes !== null) {
    await db
      .updateTable("databaseTargets")
      .set({ scaleToZeroMinutes: nextScaleToZeroMinutes })
      .where("id", "=", target.id)
      .execute();
  }

  if (
    nextTtlValue !== target.ttlValue ||
    nextTtlUnit !== target.ttlUnit ||
    nextScaleToZeroMinutes !== target.scaleToZeroMinutes
  ) {
    await db
      .updateTable("databaseTargets")
      .set({
        ttlValue: nextTtlValue,
        ttlUnit: nextTtlUnit,
        scaleToZeroMinutes: nextScaleToZeroMinutes,
      })
      .where("id", "=", target.id)
      .execute();
  }

  if (input.lifecycleStatus === "active") {
    await startDatabaseTarget({
      databaseId: target.databaseId,
      targetId: target.id,
    });
  }

  if (input.lifecycleStatus === "stopped") {
    await stopDatabaseTarget({
      databaseId: target.databaseId,
      targetId: target.id,
    });
  }

  if (
    database.engine === "postgres" &&
    (nameChanged || hostnameChanged || scaleToZeroChanged)
  ) {
    await reconnectPostgresDatabaseNetwork(database);
  }

  return getDatabaseTargetRuntime(target.id);
}

export async function deleteDatabaseTargetById(
  targetId: string,
): Promise<void> {
  const target = await getTargetById(targetId);
  await deleteDatabaseTarget({
    databaseId: target.databaseId,
    targetId: target.id,
  });
}

export async function resolveRuntimeConnection(input: {
  databaseId: string;
  targetId: string;
}): Promise<RuntimeConnection> {
  const { target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );
  const providerRef = parseProviderRef(target.providerRefJson);
  return {
    hostPort: providerRef.hostPort,
    username: providerRef.username,
    password: providerRef.password,
    database: providerRef.database,
    ssl: providerRef.ssl,
  };
}

export async function resolveContainerName(input: {
  databaseId: string;
  targetId: string;
}): Promise<string> {
  const { target } = await resolveDatabaseWithTargetById(
    input.databaseId,
    input.targetId,
  );
  return parseProviderRef(target.providerRefJson).containerName;
}

export async function listDatabasesByProject(projectId: string) {
  const databases = await db
    .selectFrom("databases")
    .selectAll()
    .where("projectId", "=", projectId)
    .orderBy("createdAt", "asc")
    .execute();

  return databases.map(normalizeDatabase);
}

export async function listDatabaseTargets(databaseId: string) {
  return db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", databaseId)
    .orderBy("createdAt", "asc")
    .execute();
}

export async function getDatabase(databaseId: string) {
  return getDatabaseById(databaseId);
}
