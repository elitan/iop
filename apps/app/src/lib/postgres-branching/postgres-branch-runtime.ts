import { exec } from "node:child_process";
import { promisify } from "node:util";
import { shellEscape } from "../shell-escape";
import {
  createBranchStorageBackend,
  createBranchStorageBackendByName,
} from "./backend-factory";
import type {
  BranchStorageBackendName,
  BranchStorageHandle,
  BranchStorageMetadata,
} from "./branch-storage-backend";

const execAsync = promisify(exec);
const CHECKPOINT_MAX_ATTEMPTS = 30;
const CHECKPOINT_RETRY_DELAY_MS = 1000;

export interface PostgresProviderRefStorageLike {
  storageBackend?: BranchStorageBackendName;
  storageRef?: string;
}

export interface PostgresProviderRefCheckpointLike {
  containerName: string;
  username: string;
  password: string;
  database: string;
}

export interface RollbackStack {
  add(step: () => Promise<void>): void;
  run(): Promise<void>;
  clear(): void;
}

export function createRollbackStack(): RollbackStack {
  const steps: Array<() => Promise<void>> = [];

  return {
    add(step: () => Promise<void>): void {
      steps.push(step);
    },
    async run(): Promise<void> {
      for (let index = steps.length - 1; index >= 0; index -= 1) {
        await steps[index]!().catch(() => undefined);
      }
      steps.length = 0;
    },
    clear(): void {
      steps.length = 0;
    },
  };
}

export function buildLiveStorageRef(
  databaseId: string,
  targetId: string,
): string {
  return `${databaseId}/${targetId}/live`;
}

export function buildResetTempStorageRef(
  databaseId: string,
  targetId: string,
): string {
  return `${databaseId}/${targetId}/reset-temp`;
}

export function getPostgresStorageMetadata(
  providerRef: PostgresProviderRefStorageLike,
): BranchStorageMetadata {
  if (!providerRef.storageBackend || !providerRef.storageRef) {
    throw new Error(
      "Postgres target is missing storage metadata. Recreate this target.",
    );
  }

  return {
    storageBackend: providerRef.storageBackend,
    storageRef: providerRef.storageRef,
  };
}

export function buildPostgresCheckpointCommand(
  input: PostgresProviderRefCheckpointLike,
): string {
  return (
    `docker exec -e PGPASSWORD=${shellEscape(input.password)} ${shellEscape(input.containerName)} ` +
    `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U ${shellEscape(input.username)} -d ${shellEscape(input.database)} ` +
    "-c CHECKPOINT;"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryCheckpoint(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("connection refused") ||
    message.includes("database system is starting up")
  );
}

export async function checkpointPostgresTargetIfRunning(input: {
  lifecycleStatus: string;
  providerRef: PostgresProviderRefCheckpointLike;
}): Promise<void> {
  if (input.lifecycleStatus !== "active") {
    return;
  }

  const command = buildPostgresCheckpointCommand(input.providerRef);

  for (let attempt = 1; attempt <= CHECKPOINT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await execAsync(command);
      return;
    } catch (error) {
      if (!shouldRetryCheckpoint(error) || attempt >= CHECKPOINT_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(CHECKPOINT_RETRY_DELAY_MS);
    }
  }
}

async function createCheckedBackendForRuntime() {
  const backend = createBranchStorageBackend();
  await backend.assertReady();
  return backend;
}

async function createCheckedBackendForStorage(
  storageBackend: BranchStorageBackendName,
) {
  const backend = createBranchStorageBackendByName(storageBackend, process.env);
  await backend.assertReady();
  return backend;
}

export async function assertPostgresBranchingReady(): Promise<BranchStorageBackendName> {
  const backend = await createCheckedBackendForRuntime();
  return backend.name;
}

export async function createPostgresPrimaryStorage(input: {
  databaseId: string;
  targetId: string;
}): Promise<BranchStorageHandle> {
  const backend = await createCheckedBackendForRuntime();
  return backend.createEmptyStorage(
    buildLiveStorageRef(input.databaseId, input.targetId),
  );
}

export async function clonePostgresStorageForTarget(input: {
  sourceStorage: BranchStorageMetadata;
  databaseId: string;
  targetId: string;
  targetStorageRef?: string;
}): Promise<BranchStorageHandle> {
  const backend = await createCheckedBackendForStorage(
    input.sourceStorage.storageBackend,
  );

  const targetStorageRef =
    input.targetStorageRef ??
    buildLiveStorageRef(input.databaseId, input.targetId);

  return backend.cloneStorage(input.sourceStorage.storageRef, targetStorageRef);
}

export async function swapPostgresStorageFromStaged(input: {
  liveStorage: BranchStorageMetadata;
  stagedStorage: BranchStorageMetadata;
}): Promise<void> {
  if (input.liveStorage.storageBackend !== input.stagedStorage.storageBackend) {
    throw new Error("Postgres storage backend mismatch during reset");
  }

  const backend = await createCheckedBackendForStorage(
    input.liveStorage.storageBackend,
  );
  await backend.swapStorage(
    input.liveStorage.storageRef,
    input.stagedStorage.storageRef,
  );
}

export async function removePostgresStorage(
  storage: BranchStorageMetadata,
): Promise<void> {
  const backend = await createCheckedBackendForStorage(storage.storageBackend);
  await backend.removeStorage(storage.storageRef);
}

export async function resolvePostgresStorageMountPath(
  storage: BranchStorageMetadata,
): Promise<string> {
  const backend = await createCheckedBackendForStorage(storage.storageBackend);
  return backend.resolveMountPath(storage.storageRef);
}
