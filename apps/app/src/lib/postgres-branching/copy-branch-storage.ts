import { execFile } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type {
  BranchStorageBackend,
  BranchStorageHandle,
} from "./branch-storage-backend";

const execFileAsync = promisify(execFile);
const DEFAULT_COPY_HELPER_IMAGE = "postgres:17";

export interface CopyBranchStorageOptions {
  basePath: string;
  helperImage?: string;
}

export function buildCopyCloneArgs(
  sourcePath: string,
  targetPath: string,
): string[] {
  return ["-a", sourcePath, targetPath];
}

export function buildCopyCloneHelperArgs(input: {
  sourcePath: string;
  targetPath: string;
  helperImage: string;
}): string[] {
  return [
    "run",
    "--rm",
    "--user",
    "0:0",
    "-v",
    `${input.sourcePath}:/from:ro`,
    "-v",
    `${input.targetPath}:/to`,
    input.helperImage,
    "cp",
    "-a",
    "/from/.",
    "/to",
  ];
}

export function buildCopyRemoveHelperArgs(input: {
  path: string;
  helperImage: string;
}): string[] {
  return [
    "run",
    "--rm",
    "--user",
    "0:0",
    "-v",
    `${dirname(input.path)}:/parent`,
    input.helperImage,
    "rm",
    "-rf",
    `/parent/${basename(input.path)}`,
  ];
}

async function runExecFile(command: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} failed: ${message}`);
  }
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  if (code === "EACCES" || code === "EPERM") {
    return true;
  }

  return error.message.includes("Permission denied");
}

export class CopyBranchStorage implements BranchStorageBackend {
  readonly name = "copy" as const;
  private readonly basePath: string;
  private readonly helperImage: string;

  constructor(options: CopyBranchStorageOptions) {
    this.basePath = options.basePath;
    this.helperImage = options.helperImage ?? DEFAULT_COPY_HELPER_IMAGE;
  }

  async assertReady(): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
  }

  async createEmptyStorage(storageRef: string): Promise<BranchStorageHandle> {
    const path = this.resolveAbsolutePath(storageRef);
    await this.removeStoragePath(path);
    await mkdir(path, { recursive: true });
    return this.toHandle(storageRef);
  }

  async cloneStorage(
    sourceStorageRef: string,
    targetStorageRef: string,
  ): Promise<BranchStorageHandle> {
    const sourcePath = this.resolveAbsolutePath(sourceStorageRef);
    const targetPath = this.resolveAbsolutePath(targetStorageRef);

    await this.removeStoragePath(targetPath);
    await mkdir(dirname(targetPath), { recursive: true });

    try {
      await runExecFile("cp", buildCopyCloneArgs(sourcePath, targetPath));
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }

      await mkdir(targetPath, { recursive: true });
      await runExecFile(
        "docker",
        buildCopyCloneHelperArgs({
          sourcePath,
          targetPath,
          helperImage: this.helperImage,
        }),
      );
    }

    return this.toHandle(targetStorageRef);
  }

  async swapStorage(
    liveStorageRef: string,
    stagedStorageRef: string,
  ): Promise<void> {
    const livePath = this.resolveAbsolutePath(liveStorageRef);
    const stagedPath = this.resolveAbsolutePath(stagedStorageRef);
    const backupPath = `${livePath}.old`;

    await rm(backupPath, { recursive: true, force: true });
    await rename(livePath, backupPath);

    try {
      await rename(stagedPath, livePath);
    } catch (error) {
      await rename(backupPath, livePath).catch(() => undefined);
      throw error;
    }

    await rm(backupPath, { recursive: true, force: true });
  }

  async removeStorage(storageRef: string): Promise<void> {
    const path = this.resolveAbsolutePath(storageRef);
    await this.removeStoragePath(path);
  }

  async resolveMountPath(storageRef: string): Promise<string> {
    return this.resolveAbsolutePath(storageRef);
  }

  private resolveAbsolutePath(storageRef: string): string {
    return join(this.basePath, storageRef);
  }

  private async removeStoragePath(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }

      await runExecFile(
        "docker",
        buildCopyRemoveHelperArgs({
          path,
          helperImage: this.helperImage,
        }),
      );
    }
  }

  private toHandle(storageRef: string): BranchStorageHandle {
    return {
      storageBackend: this.name,
      storageRef,
      mountPath: this.resolveAbsolutePath(storageRef),
    };
  }
}
