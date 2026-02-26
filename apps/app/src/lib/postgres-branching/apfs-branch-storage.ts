import { execFile } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type {
  BranchStorageBackend,
  BranchStorageHandle,
} from "./branch-storage-backend";

const execFileAsync = promisify(execFile);

export interface ApfsBranchStorageOptions {
  basePath: string;
}

export function buildApfsCloneArgs(
  sourcePath: string,
  targetPath: string,
): string[] {
  return ["-cR", sourcePath, targetPath];
}

function normalizeFsType(value: string): string {
  return value.trim().toLowerCase();
}

function parseDfDevice(dfOutput: string): string {
  const lines = dfOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return "";
  }
  const fields = lines[lines.length - 1]!.split(/\s+/);
  return fields[0] ?? "";
}

function parseDiskutilFsType(output: string): string {
  const bundleMatch = output.match(/Type \(Bundle\):\s*(.+)$/im);
  if (bundleMatch?.[1]) {
    return normalizeFsType(bundleMatch[1]);
  }

  const personalityMatch = output.match(/File System Personality:\s*(.+)$/im);
  if (personalityMatch?.[1]) {
    return normalizeFsType(personalityMatch[1]);
  }

  return "unknown";
}

async function detectMacFsType(path: string): Promise<string> {
  const dfOutput = await runExecFile("df", ["-P", path]);
  const device = parseDfDevice(dfOutput);
  if (device.length === 0) {
    return "unknown";
  }

  const diskutilOutput = await runExecFile("diskutil", ["info", device]);
  return parseDiskutilFsType(diskutilOutput);
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

export class ApfsBranchStorage implements BranchStorageBackend {
  readonly name = "apfs" as const;
  private readonly basePath: string;

  constructor(options: ApfsBranchStorageOptions) {
    this.basePath = options.basePath;
  }

  async assertReady(): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error("APFS storage backend is only supported on macOS");
    }

    await mkdir(this.basePath, { recursive: true });
    const fsType = await detectMacFsType(this.basePath);

    if (!fsType.includes("apfs")) {
      throw new Error(
        `Postgres branching requires APFS at ${this.basePath}. Current filesystem is ${fsType || "unknown"}.`,
      );
    }
  }

  async createEmptyStorage(storageRef: string): Promise<BranchStorageHandle> {
    const path = this.resolveAbsolutePath(storageRef);
    await rm(path, { recursive: true, force: true });
    await mkdir(path, { recursive: true });
    return this.toHandle(storageRef);
  }

  async cloneStorage(
    sourceStorageRef: string,
    targetStorageRef: string,
  ): Promise<BranchStorageHandle> {
    const sourcePath = this.resolveAbsolutePath(sourceStorageRef);
    const targetPath = this.resolveAbsolutePath(targetStorageRef);

    await rm(targetPath, { recursive: true, force: true });
    await mkdir(dirname(targetPath), { recursive: true });
    await runExecFile("cp", buildApfsCloneArgs(sourcePath, targetPath));

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
    await rm(path, { recursive: true, force: true });
  }

  async resolveMountPath(storageRef: string): Promise<string> {
    return this.resolveAbsolutePath(storageRef);
  }

  private resolveAbsolutePath(storageRef: string): string {
    return join(this.basePath, storageRef);
  }

  private toHandle(storageRef: string): BranchStorageHandle {
    return {
      storageBackend: this.name,
      storageRef,
      mountPath: this.resolveAbsolutePath(storageRef),
    };
  }
}
