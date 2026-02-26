import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type {
  BranchStorageBackend,
  BranchStorageHandle,
} from "./branch-storage-backend";

const execFileAsync = promisify(execFile);

export interface ZfsBranchStorageOptions {
  pool: string;
  datasetBase: string;
  mountBase: string;
}

export function normalizeDatasetBase(datasetBase: string): string {
  return datasetBase.replace(/^\/+|\/+$/g, "");
}

export function normalizeStorageRef(storageRef: string): string {
  return storageRef.replace(/^\/+|\/+$/g, "");
}

export function buildZfsDatasetPath(
  pool: string,
  datasetBase: string,
  storageRef: string,
): string {
  const normalizedBase = normalizeDatasetBase(datasetBase);
  const normalizedStorageRef = normalizeStorageRef(storageRef);
  if (normalizedBase.length === 0) {
    return `${pool}/${normalizedStorageRef}`;
  }
  return `${pool}/${normalizedBase}/${normalizedStorageRef}`;
}

export function buildZfsMountPath(
  mountBase: string,
  storageRef: string,
): string {
  return join(mountBase, normalizeStorageRef(storageRef));
}

export function buildZfsCreateArgs(
  datasetPath: string,
  mountPath: string,
): string[] {
  return [
    "create",
    "-p",
    "-o",
    "compression=lz4",
    "-o",
    "recordsize=8k",
    "-o",
    "atime=off",
    "-o",
    `mountpoint=${mountPath}`,
    datasetPath,
  ];
}

export function buildZfsCloneArgs(
  snapshotName: string,
  targetDatasetPath: string,
  mountPath: string,
): string[] {
  return [
    "clone",
    "-p",
    "-o",
    "compression=lz4",
    "-o",
    "recordsize=8k",
    "-o",
    "atime=off",
    "-o",
    `mountpoint=${mountPath}`,
    snapshotName,
    targetDatasetPath,
  ];
}

function formatExecError(command: string, error: unknown): string {
  if (!error || typeof error !== "object") {
    return `${command} failed`;
  }

  const maybeError = error as {
    message?: string;
    stderr?: string;
    stdout?: string;
  };

  const detail = [maybeError.stderr, maybeError.stdout, maybeError.message]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();

  if (detail.length === 0) {
    return `${command} failed`;
  }

  return `${command} failed: ${detail}`;
}

function isDatasetNotFound(error: unknown): boolean {
  const message = formatExecError("zfs", error).toLowerCase();
  return (
    message.includes("dataset does not exist") ||
    message.includes("no such pool")
  );
}

function isAlreadyMountedError(error: unknown): boolean {
  const message = formatExecError("zfs", error).toLowerCase();
  return message.includes("already mounted");
}

function isNotMountedError(error: unknown): boolean {
  const message = formatExecError("zfs", error).toLowerCase();
  return (
    message.includes("not currently mounted") || message.includes("not mounted")
  );
}

async function runExec(command: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout;
  } catch (error) {
    throw new Error(formatExecError(command, error));
  }
}

export class ZfsBranchStorage implements BranchStorageBackend {
  readonly name = "zfs" as const;
  private readonly pool: string;
  private readonly datasetBase: string;
  private readonly mountBase: string;

  constructor(options: ZfsBranchStorageOptions) {
    this.pool = options.pool.trim();
    this.datasetBase = normalizeDatasetBase(options.datasetBase);
    this.mountBase = options.mountBase;
  }

  async assertReady(): Promise<void> {
    if (process.platform !== "linux") {
      throw new Error("ZFS storage backend is only supported on Linux");
    }

    if (this.pool.length === 0) {
      throw new Error(
        "Postgres branching needs FROST_POSTGRES_ZFS_POOL configured. Run install.sh or update.sh and set the pool in /opt/frost/.env.",
      );
    }

    await mkdir(this.mountBase, { recursive: true });

    await runExec("zfs", ["list", "-H"]);
    await runExec("zpool", ["list", "-H", "-o", "name", this.pool]);

    const baseDataset = this.getBaseDatasetPath();
    const exists = await this.datasetExistsByPath(baseDataset);
    if (!exists) {
      throw new Error(
        `Missing ZFS dataset ${baseDataset}. Run install.sh or update.sh to prepare ZFS for Postgres branching.`,
      );
    }
  }

  async createEmptyStorage(storageRef: string): Promise<BranchStorageHandle> {
    const datasetPath = this.getDatasetPath(storageRef);
    const mountPath = this.getMountPath(storageRef);

    await this.removeStorage(storageRef);
    await mkdir(dirname(mountPath), { recursive: true });
    await runExec("zfs", buildZfsCreateArgs(datasetPath, mountPath));
    await this.mountDataset(datasetPath);

    return this.toHandle(storageRef);
  }

  async cloneStorage(
    sourceStorageRef: string,
    targetStorageRef: string,
  ): Promise<BranchStorageHandle> {
    const sourceDatasetPath = this.getDatasetPath(sourceStorageRef);
    const targetDatasetPath = this.getDatasetPath(targetStorageRef);
    const targetMountPath = this.getMountPath(targetStorageRef);

    const sourceExists = await this.datasetExistsByPath(sourceDatasetPath);
    if (!sourceExists) {
      throw new Error(`Source ZFS dataset not found: ${sourceDatasetPath}`);
    }

    await this.removeStorage(targetStorageRef);
    await mkdir(dirname(targetMountPath), { recursive: true });

    const snapshotName = `${sourceDatasetPath}@frost-${Date.now()}-${nanoid(6).toLowerCase()}`;
    await runExec("zfs", ["snapshot", snapshotName]);

    try {
      await runExec(
        "zfs",
        buildZfsCloneArgs(snapshotName, targetDatasetPath, targetMountPath),
      );
    } catch (error) {
      await runExec("zfs", ["destroy", snapshotName]).catch(() => undefined);
      throw error;
    }
    await this.mountDataset(targetDatasetPath);

    return this.toHandle(targetStorageRef);
  }

  async swapStorage(
    liveStorageRef: string,
    stagedStorageRef: string,
  ): Promise<void> {
    const liveDatasetPath = this.getDatasetPath(liveStorageRef);
    const stagedDatasetPath = this.getDatasetPath(stagedStorageRef);
    const backupDatasetPath = `${liveDatasetPath}-old-${Date.now()}`;
    const liveMountPath = this.getMountPath(liveStorageRef);

    await this.unmountDataset(liveDatasetPath);
    await this.unmountDataset(stagedDatasetPath);
    await runExec("zfs", ["rename", liveDatasetPath, backupDatasetPath]);

    try {
      await runExec("zfs", ["rename", stagedDatasetPath, liveDatasetPath]);
      await runExec("zfs", [
        "set",
        `mountpoint=${liveMountPath}`,
        liveDatasetPath,
      ]);
      await this.mountDataset(liveDatasetPath);
    } catch (error) {
      await runExec("zfs", [
        "rename",
        backupDatasetPath,
        liveDatasetPath,
      ]).catch(() => undefined);
      throw error;
    }

    await runExec("zfs", ["destroy", "-r", backupDatasetPath]).catch(
      () => undefined,
    );
  }

  async removeStorage(storageRef: string): Promise<void> {
    const datasetPath = this.getDatasetPath(storageRef);
    const mountPath = this.getMountPath(storageRef);

    await this.unmountDataset(datasetPath);

    try {
      await runExec("zfs", ["destroy", "-r", datasetPath]);
    } catch (error) {
      if (!isDatasetNotFound(error)) {
        throw error;
      }
    }

    await rm(mountPath, { recursive: true, force: true });
  }

  async resolveMountPath(storageRef: string): Promise<string> {
    return this.getMountPath(storageRef);
  }

  private async datasetExistsByPath(datasetPath: string): Promise<boolean> {
    try {
      await runExec("zfs", ["list", "-H", datasetPath]);
      return true;
    } catch {
      return false;
    }
  }

  private async unmountDataset(datasetPath: string): Promise<void> {
    try {
      await runExec("zfs", ["unmount", datasetPath]);
    } catch (error) {
      if (!isNotMountedError(error) && !isDatasetNotFound(error)) {
        throw error;
      }
    }
  }

  private async mountDataset(datasetPath: string): Promise<void> {
    try {
      await runExec("zfs", ["mount", datasetPath]);
    } catch (error) {
      if (!isAlreadyMountedError(error)) {
        throw error;
      }
    }
  }

  private getBaseDatasetPath(): string {
    if (this.datasetBase.length === 0) {
      return this.pool;
    }
    return `${this.pool}/${this.datasetBase}`;
  }

  private getDatasetPath(storageRef: string): string {
    return buildZfsDatasetPath(this.pool, this.datasetBase, storageRef);
  }

  private getMountPath(storageRef: string): string {
    return buildZfsMountPath(this.mountBase, storageRef);
  }

  private toHandle(storageRef: string): BranchStorageHandle {
    return {
      storageBackend: this.name,
      storageRef,
      mountPath: this.getMountPath(storageRef),
    };
  }
}
