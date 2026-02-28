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
import { db } from "./db";
import type {
  Databases,
  DatabaseTargetDeployments,
  DatabaseTargets,
  Environments,
  Services,
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
  newEnvironmentDatabaseAttachmentId,
  newRuntimeServiceId,
  newServiceDatabaseBindingId,
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
export type AttachmentMode = "managed" | "manual";
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
  image: string;
  port: number;
  storageBackend: BranchStorageBackendName | null;
  memoryLimit: string | null;
  cpuLimit: number | null;
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
const ENV_VAR_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const MEMORY_LIMIT_PATTERN = /^\d+[kmg]$/i;
const POSTGRES_QUERY_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

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
  return {
    containerName: value.containerName,
    hostPort: value.hostPort,
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
    fixedHostPort: input.providerRef.hostPort,
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

export async function ensureTargetNetworkAttachment(input: {
  environment: Selectable<Environments>;
  database: Selectable<Databases>;
  target: Selectable<DatabaseTargets>;
}): Promise<void> {
  const providerRef = parseProviderRef(input.target.providerRefJson);
  const networkName = buildNetworkName(input.environment);
  await createNetwork(networkName, {
    "frost.managed": "true",
    "frost.project.id": input.environment.projectId,
  });
  await connectContainerToNetwork(providerRef.containerName, networkName, [
    ...getBaseAliases(input.database.name),
  ]);
}

async function ensurePostgresDatabaseNetworkAttachment(input: {
  environment: Selectable<Environments>;
  database: Selectable<Databases>;
  defaultTargetId: string;
}): Promise<void> {
  const targets = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("databaseId", "=", input.database.id)
    .execute();

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
        includeBaseAliases: target.id === input.defaultTargetId,
      }),
    );
  }
}

async function reconnectPostgresDatabaseAttachments(
  database: Selectable<Databases>,
): Promise<void> {
  const envDefaults = await db
    .selectFrom("environmentDatabaseAttachments")
    .innerJoin(
      "environments",
      "environments.id",
      "environmentDatabaseAttachments.environmentId",
    )
    .selectAll("environments")
    .select("environmentDatabaseAttachments.targetId as defaultTargetId")
    .where("environmentDatabaseAttachments.databaseId", "=", database.id)
    .execute();

  for (const envDefault of envDefaults) {
    await ensurePostgresDatabaseNetworkAttachment({
      environment: envDefault,
      database,
      defaultTargetId: envDefault.defaultTargetId,
    });
  }
}

function buildConnectionString(
  database: Selectable<Databases>,
  providerRef: ProviderRef,
): string {
  const username = encodeURIComponent(providerRef.username);
  const password = encodeURIComponent(providerRef.password);
  const dbName = encodeURIComponent(providerRef.database);
  const host = database.name;
  if (database.engine === "postgres") {
    const sslQuery = providerRef.ssl ? "?sslmode=require" : "";
    return `postgres://${username}:${password}@${host}:5432/${dbName}${sslQuery}`;
  }
  return `mysql://${username}:${password}@${host}:3306/${dbName}`;
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
      const environments = await db
        .selectFrom("environments")
        .selectAll()
        .where("projectId", "=", input.projectId)
        .execute();

      for (const environment of environments) {
        await db
          .insertInto("environmentDatabaseAttachments")
          .values({
            id: newEnvironmentDatabaseAttachmentId(),
            environmentId: environment.id,
            databaseId,
            targetId,
            mode: "managed",
            createdAt: Date.now(),
          })
          .execute();

        await ensurePostgresDatabaseNetworkAttachment({
          environment,
          database: createdDatabase,
          defaultTargetId: targetId,
        });
      }
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
    await reconnectPostgresDatabaseAttachments(database);
  }
  return target;
}

async function reconnectTargetAttachments(
  database: Selectable<Databases>,
  target: Selectable<DatabaseTargets>,
): Promise<void> {
  if (database.engine === "postgres") {
    await reconnectPostgresDatabaseAttachments(database);
    return;
  }

  const attachments = await db
    .selectFrom("environmentDatabaseAttachments")
    .innerJoin(
      "environments",
      "environments.id",
      "environmentDatabaseAttachments.environmentId",
    )
    .selectAll("environments")
    .where("environmentDatabaseAttachments.targetId", "=", target.id)
    .execute();

  for (const environment of attachments) {
    await ensureTargetNetworkAttachment({
      environment,
      database,
      target,
    });
  }
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
      fixedHostPort: currentRef.hostPort,
      storageMountPath: liveMountPath,
    });
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

  await db
    .updateTable("databaseTargets")
    .set({
      sourceTargetId: sourceTarget.id,
      lifecycleStatus: "active",
      providerRefJson: toProviderRefJson(nextRef),
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
  await reconnectTargetAttachments(database, updated);
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
  const nextRef = await recreateTargetRuntime({
    database,
    target,
    providerRef,
  });

  await db
    .updateTable("databaseTargets")
    .set({
      lifecycleStatus: "active",
      providerRefJson: toProviderRefJson(nextRef),
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
  await reconnectTargetAttachments(database, updated);
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

  const attachment = await db
    .selectFrom("environmentDatabaseAttachments")
    .select("id")
    .where("targetId", "=", target.id)
    .executeTakeFirst();

  if (attachment) {
    throw new Error("Target is attached to one or more environments");
  }

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
    const providerRef = parseProviderRef(target.providerRefJson);
    await stopContainer(providerRef.containerName);
    if (database.engine === "postgres") {
      await removePostgresStorage(getPostgresStorageMetadata(providerRef));
    }
  }

  await db.deleteFrom("databases").where("id", "=", database.id).execute();
}

export async function putEnvironmentAttachment(input: {
  environmentId: string;
  databaseId: string;
  targetId: string;
  mode: AttachmentMode;
}): Promise<void> {
  const environment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", input.environmentId)
    .executeTakeFirst();

  if (!environment) {
    throw new Error("Environment not found");
  }

  const database = await getDatabaseById(input.databaseId);

  if (database.projectId !== environment.projectId) {
    throw new Error("Environment and database must belong to the same project");
  }

  const target = await getTargetById(input.targetId);

  if (target.databaseId !== database.id) {
    throw new Error("Target does not belong to the database");
  }

  if (
    environment.type === "production" &&
    database.engine === "postgres" &&
    target.name !== "main"
  ) {
    throw new Error("Production Postgres attachment must use main");
  }

  const existingAttachment = await db
    .selectFrom("environmentDatabaseAttachments")
    .selectAll()
    .where("environmentId", "=", environment.id)
    .where("databaseId", "=", database.id)
    .executeTakeFirst();

  await db
    .deleteFrom("environmentDatabaseAttachments")
    .where("environmentId", "=", environment.id)
    .where("databaseId", "=", database.id)
    .execute();

  await db
    .insertInto("environmentDatabaseAttachments")
    .values({
      id: newEnvironmentDatabaseAttachmentId(),
      environmentId: environment.id,
      databaseId: database.id,
      targetId: target.id,
      mode: input.mode,
      createdAt: Date.now(),
    })
    .execute();

  if (database.engine === "postgres") {
    await ensurePostgresDatabaseNetworkAttachment({
      environment,
      database,
      defaultTargetId: target.id,
    });
    return;
  }

  if (existingAttachment && existingAttachment.targetId !== target.id) {
    const previousTarget = await db
      .selectFrom("databaseTargets")
      .select("providerRefJson")
      .where("id", "=", existingAttachment.targetId)
      .executeTakeFirst();

    if (previousTarget) {
      const previousRef = parseProviderRef(previousTarget.providerRefJson);
      await disconnectContainerFromNetwork(
        previousRef.containerName,
        buildNetworkName(environment),
      );
    }
  }

  await ensureTargetNetworkAttachment({ environment, database, target });
}

export async function deleteEnvironmentAttachment(input: {
  environmentId: string;
  databaseId: string;
}): Promise<void> {
  const attachment = await db
    .selectFrom("environmentDatabaseAttachments")
    .selectAll()
    .where("environmentId", "=", input.environmentId)
    .where("databaseId", "=", input.databaseId)
    .executeTakeFirst();

  if (!attachment) {
    return;
  }

  const [environment, target, database] = await Promise.all([
    db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", attachment.environmentId)
      .executeTakeFirst(),
    db
      .selectFrom("databaseTargets")
      .selectAll()
      .where("id", "=", attachment.targetId)
      .executeTakeFirst(),
    db
      .selectFrom("databases")
      .selectAll()
      .where("id", "=", attachment.databaseId)
      .executeTakeFirst(),
  ]);

  await db
    .deleteFrom("environmentDatabaseAttachments")
    .where("id", "=", attachment.id)
    .execute();

  if (environment && database && database.engine === "postgres") {
    const targets = await db
      .selectFrom("databaseTargets")
      .select("providerRefJson")
      .where("databaseId", "=", database.id)
      .execute();
    const networkName = buildNetworkName(environment);
    for (const row of targets) {
      const providerRef = parseProviderRef(row.providerRefJson);
      await disconnectContainerFromNetwork(
        providerRef.containerName,
        networkName,
      );
    }

    if (attachment.mode !== "managed") {
      return;
    }

    const remaining = await db
      .selectFrom("environmentDatabaseAttachments")
      .select("id")
      .where("targetId", "=", attachment.targetId)
      .executeTakeFirst();

    if (remaining) {
      return;
    }

    if (!target || target.name === "main") {
      return;
    }

    const providerRef = parseProviderRef(target.providerRefJson);
    await stopContainer(providerRef.containerName);
    await removePostgresStorage(getPostgresStorageMetadata(providerRef));
    await db
      .deleteFrom("databaseTargets")
      .where("id", "=", target.id)
      .execute();
    return;
  }

  if (environment && target) {
    const providerRef = parseProviderRef(target.providerRefJson);
    await disconnectContainerFromNetwork(
      providerRef.containerName,
      buildNetworkName(environment),
    );
  }

  if (attachment.mode !== "managed") {
    return;
  }

  const remaining = await db
    .selectFrom("environmentDatabaseAttachments")
    .select("id")
    .where("targetId", "=", attachment.targetId)
    .executeTakeFirst();

  if (remaining) {
    return;
  }

  if (!target || target.name === "main") {
    return;
  }

  const providerRef = parseProviderRef(target.providerRefJson);
  await stopContainer(providerRef.containerName);
  await db.deleteFrom("databaseTargets").where("id", "=", target.id).execute();
}

export async function cleanupEnvironmentAttachments(
  environmentId: string,
): Promise<void> {
  const attachments = await db
    .selectFrom("environmentDatabaseAttachments")
    .select(["environmentId", "databaseId"])
    .where("environmentId", "=", environmentId)
    .execute();

  for (const attachment of attachments) {
    await deleteEnvironmentAttachment(attachment);
  }
}

export async function createServiceDatabaseBinding(input: {
  serviceId: string;
  databaseId: string;
  envVarKey: string;
}): Promise<void> {
  if (!ENV_VAR_KEY_PATTERN.test(input.envVarKey)) {
    throw new Error(
      "envVarKey must be uppercase and use letters, numbers, and underscores",
    );
  }

  const service = await db
    .selectFrom("services")
    .innerJoin("environments", "environments.id", "services.environmentId")
    .select(["services.id as serviceId", "environments.projectId as projectId"])
    .where("services.id", "=", input.serviceId)
    .executeTakeFirst();

  if (!service) {
    throw new Error("Service not found");
  }

  const database = await getDatabaseById(input.databaseId);
  if (database.projectId !== service.projectId) {
    throw new Error("Service and database must belong to the same project");
  }

  const existing = await db
    .selectFrom("serviceDatabaseBindings")
    .select("id")
    .where("serviceId", "=", input.serviceId)
    .where("envVarKey", "=", input.envVarKey)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("serviceDatabaseBindings")
      .set({ databaseId: input.databaseId })
      .where("id", "=", existing.id)
      .execute();
    return;
  }

  await db
    .insertInto("serviceDatabaseBindings")
    .values({
      id: newServiceDatabaseBindingId(),
      serviceId: input.serviceId,
      databaseId: input.databaseId,
      envVarKey: input.envVarKey,
      createdAt: Date.now(),
    })
    .execute();
}

export async function deleteServiceDatabaseBinding(
  bindingId: string,
): Promise<void> {
  await db
    .deleteFrom("serviceDatabaseBindings")
    .where("id", "=", bindingId)
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
    const nextRef = await recreateTargetRuntime({
      database,
      target,
      providerRef,
    });

    await db
      .updateTable("databaseTargets")
      .set({
        lifecycleStatus: "active",
        providerRefJson: toProviderRefJson(nextRef),
      })
      .where("id", "=", target.id)
      .execute();

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
    image: providerRef.image,
    port: providerRef.port,
    storageBackend: providerRef.storageBackend ?? null,
    memoryLimit: providerRef.memoryLimit,
    cpuLimit: providerRef.cpuLimit,
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
  }
}

export async function patchDatabaseTargetRuntimeSettings(input: {
  targetId: string;
  name?: string;
  hostname?: string;
  lifecycleStatus?: "active" | "stopped";
  memoryLimit?: string | null;
  cpuLimit?: number | null;
}): Promise<DatabaseTargetRuntimeInfo> {
  const target = await getTargetById(input.targetId);
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

  if (nameChanged || hostnameChanged) {
    const database = await getDatabaseById(target.databaseId);
    if (database.engine === "postgres") {
      await reconnectPostgresDatabaseAttachments(database);
    }
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

export async function resolveServiceDatabaseEnvVars(input: {
  serviceId: string;
  environmentId: string;
}): Promise<Record<string, string>> {
  const service = await db
    .selectFrom("services")
    .select(["id", "environmentId"])
    .where("id", "=", input.serviceId)
    .executeTakeFirst();

  if (!service) {
    throw new Error("Service not found");
  }

  if (service.environmentId !== input.environmentId) {
    throw new Error("Service does not belong to the requested environment");
  }

  const bindings = await db
    .selectFrom("serviceDatabaseBindings")
    .innerJoin(
      "databases",
      "databases.id",
      "serviceDatabaseBindings.databaseId",
    )
    .select([
      "serviceDatabaseBindings.envVarKey",
      "serviceDatabaseBindings.databaseId",
      "databases.name as databaseName",
      "databases.engine as databaseEngine",
      "databases.projectId as projectId",
    ])
    .where("serviceDatabaseBindings.serviceId", "=", input.serviceId)
    .execute();

  if (bindings.length === 0) {
    return {};
  }

  const environment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", input.environmentId)
    .executeTakeFirst();

  if (!environment) {
    throw new Error("Environment not found");
  }

  const envVars: Record<string, string> = {};

  for (const binding of bindings) {
    if (binding.projectId !== environment.projectId) {
      throw new Error("Database binding project mismatch");
    }

    let attachment = await db
      .selectFrom("environmentDatabaseAttachments")
      .selectAll()
      .where("environmentId", "=", environment.id)
      .where("databaseId", "=", binding.databaseId)
      .executeTakeFirst();

    const database = await getDatabaseById(binding.databaseId);

    if (!attachment) {
      if (database.engine === "postgres") {
        const mainTarget = await getTargetByName(database.id, "main");
        await putEnvironmentAttachment({
          environmentId: environment.id,
          databaseId: database.id,
          targetId: mainTarget.id,
          mode: "managed",
        });
        attachment = await db
          .selectFrom("environmentDatabaseAttachments")
          .selectAll()
          .where("environmentId", "=", environment.id)
          .where("databaseId", "=", binding.databaseId)
          .executeTakeFirst();
      } else {
        throw new Error(
          `Environment is missing attachment for database ${binding.databaseName}`,
        );
      }
    }

    if (!attachment) {
      throw new Error("Failed to resolve database default target");
    }

    let target = await getTargetById(attachment.targetId);

    if (target.lifecycleStatus !== "active") {
      target = await startDatabaseTarget({
        databaseId: database.id,
        targetId: target.id,
      });
    }

    const providerRef = parseProviderRef(target.providerRefJson);

    if (database.engine === "postgres") {
      await ensurePostgresDatabaseNetworkAttachment({
        environment,
        database,
        defaultTargetId: target.id,
      });
    } else {
      await ensureTargetNetworkAttachment({
        environment,
        database,
        target,
      });
    }

    envVars[binding.envVarKey] = buildConnectionString(database, providerRef);
  }

  return envVars;
}

function buildManagedTargetNameFromEnvironment(
  environment: Selectable<Environments>,
): string {
  if (environment.type === "preview" && environment.prNumber !== null) {
    return `pr-${environment.prNumber}`;
  }
  return slugify(environment.name).slice(0, 62);
}

export async function cloneEnvironmentDatabaseTargets(input: {
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
}): Promise<void> {
  const sourceEnvironment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", input.sourceEnvironmentId)
    .executeTakeFirst();

  const targetEnvironment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", input.targetEnvironmentId)
    .executeTakeFirst();

  if (!sourceEnvironment || !targetEnvironment) {
    throw new Error("Environment not found");
  }

  if (sourceEnvironment.projectId !== targetEnvironment.projectId) {
    throw new Error("Source and target environments must share a project");
  }

  const sourceAttachments = await db
    .selectFrom("environmentDatabaseAttachments")
    .innerJoin(
      "databases",
      "databases.id",
      "environmentDatabaseAttachments.databaseId",
    )
    .innerJoin(
      "databaseTargets",
      "databaseTargets.id",
      "environmentDatabaseAttachments.targetId",
    )
    .selectAll("environmentDatabaseAttachments")
    .selectAll("databases")
    .select([
      "databaseTargets.id as sourceTargetId",
      "databaseTargets.name as sourceTargetName",
    ])
    .where(
      "environmentDatabaseAttachments.environmentId",
      "=",
      sourceEnvironment.id,
    )
    .execute();

  for (const row of sourceAttachments) {
    const databaseId = row.databaseId;
    const database = await getDatabaseById(databaseId);
    const managedTargetName =
      buildManagedTargetNameFromEnvironment(targetEnvironment);

    let target = await db
      .selectFrom("databaseTargets")
      .selectAll()
      .where("databaseId", "=", databaseId)
      .where("name", "=", managedTargetName)
      .executeTakeFirst();

    if (!target) {
      if (database.engine === "postgres") {
        target = await createDatabaseTarget({
          databaseId,
          name: managedTargetName,
          sourceTargetName: row.sourceTargetName,
        });
      } else {
        target = await createDatabaseTarget({
          databaseId,
          name: managedTargetName,
        });
      }
    }

    await putEnvironmentAttachment({
      environmentId: targetEnvironment.id,
      databaseId,
      targetId: target.id,
      mode: "managed",
    });
  }
}

export async function ensureEnvironmentPostgresDefaults(
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
    let attachment = await db
      .selectFrom("environmentDatabaseAttachments")
      .selectAll()
      .where("environmentId", "=", environment.id)
      .where("databaseId", "=", database.id)
      .executeTakeFirst();

    if (!attachment) {
      const mainTarget = await getTargetByName(database.id, "main");
      await db
        .insertInto("environmentDatabaseAttachments")
        .values({
          id: newEnvironmentDatabaseAttachmentId(),
          environmentId: environment.id,
          databaseId: database.id,
          targetId: mainTarget.id,
          mode: "managed",
          createdAt: Date.now(),
        })
        .execute();

      attachment = await db
        .selectFrom("environmentDatabaseAttachments")
        .selectAll()
        .where("environmentId", "=", environment.id)
        .where("databaseId", "=", database.id)
        .executeTakeFirst();
    }

    if (!attachment) {
      continue;
    }

    await ensurePostgresDatabaseNetworkAttachment({
      environment,
      database,
      defaultTargetId: attachment.targetId,
    });
  }
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

export async function listEnvironmentDatabaseAttachments(
  environmentId: string,
) {
  return db
    .selectFrom("environmentDatabaseAttachments")
    .innerJoin(
      "databases",
      "databases.id",
      "environmentDatabaseAttachments.databaseId",
    )
    .innerJoin(
      "databaseTargets",
      "databaseTargets.id",
      "environmentDatabaseAttachments.targetId",
    )
    .selectAll("environmentDatabaseAttachments")
    .select([
      "databases.name as databaseName",
      "databases.engine as databaseEngine",
      "databaseTargets.name as targetName",
      "databaseTargets.lifecycleStatus as targetLifecycleStatus",
    ])
    .where("environmentDatabaseAttachments.environmentId", "=", environmentId)
    .orderBy("environmentDatabaseAttachments.createdAt", "asc")
    .execute();
}

export async function listServiceDatabaseBindings(serviceId: string) {
  return db
    .selectFrom("serviceDatabaseBindings")
    .innerJoin(
      "databases",
      "databases.id",
      "serviceDatabaseBindings.databaseId",
    )
    .selectAll("serviceDatabaseBindings")
    .select([
      "databases.name as databaseName",
      "databases.engine as databaseEngine",
    ])
    .where("serviceDatabaseBindings.serviceId", "=", serviceId)
    .orderBy("serviceDatabaseBindings.createdAt", "asc")
    .execute();
}

export async function getDatabase(databaseId: string) {
  return getDatabaseById(databaseId);
}

export async function listDatabaseAttachments(databaseId: string) {
  return db
    .selectFrom("environmentDatabaseAttachments")
    .innerJoin(
      "environments",
      "environments.id",
      "environmentDatabaseAttachments.environmentId",
    )
    .innerJoin(
      "databaseTargets",
      "databaseTargets.id",
      "environmentDatabaseAttachments.targetId",
    )
    .select([
      "environmentDatabaseAttachments.id",
      "environmentDatabaseAttachments.environmentId",
      "environmentDatabaseAttachments.databaseId",
      "environmentDatabaseAttachments.targetId",
      "environmentDatabaseAttachments.mode",
      "environmentDatabaseAttachments.createdAt",
      "environments.name as environmentName",
      "environments.type as environmentType",
      "databaseTargets.name as targetName",
    ])
    .where("environmentDatabaseAttachments.databaseId", "=", databaseId)
    .orderBy("environmentDatabaseAttachments.createdAt", "asc")
    .execute();
}

export async function assertComputeService(
  serviceId: string,
): Promise<Selectable<Services>> {
  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", serviceId)
    .executeTakeFirst();

  if (!service) {
    throw new Error("Service not found");
  }

  if (service.serviceType === "database") {
    throw new Error(
      "Database bindings are only supported for compute services",
    );
  }

  return service;
}
