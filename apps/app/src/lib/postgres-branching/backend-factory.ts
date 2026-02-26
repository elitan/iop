import { join } from "node:path";
import { getDataDir } from "../paths";
import { ApfsBranchStorage } from "./apfs-branch-storage";
import type {
  BranchStorageBackend,
  BranchStorageBackendName,
} from "./branch-storage-backend";
import {
  ZfsBranchStorage,
  type ZfsBranchStorageOptions,
} from "./zfs-branch-storage";

export function resolveBranchStorageBackendName(
  platform: NodeJS.Platform,
): BranchStorageBackendName {
  if (platform === "darwin") {
    return "apfs";
  }

  if (platform === "linux") {
    return "zfs";
  }

  throw new Error(
    `Postgres branching is only supported on macOS and Linux. Current platform: ${platform}`,
  );
}

export function resolveApfsBasePath(env: NodeJS.ProcessEnv): string {
  return env.FROST_POSTGRES_APFS_BASE ?? join(getDataDir(), "postgres", "apfs");
}

export function resolveZfsOptions(
  env: NodeJS.ProcessEnv,
): ZfsBranchStorageOptions {
  return {
    pool: env.FROST_POSTGRES_ZFS_POOL ?? "",
    datasetBase: env.FROST_POSTGRES_ZFS_DATASET_BASE ?? "frost/databases",
    mountBase:
      env.FROST_POSTGRES_ZFS_MOUNT_BASE ?? "/opt/frost/data/postgres/zfs",
  };
}

export function createBranchStorageBackendForPlatform(input: {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}): BranchStorageBackend {
  const backendName = resolveBranchStorageBackendName(input.platform);
  return createBranchStorageBackendByName(backendName, input.env);
}

export function createBranchStorageBackend(): BranchStorageBackend {
  return createBranchStorageBackendForPlatform({
    platform: process.platform,
    env: process.env,
  });
}

export function createBranchStorageBackendByName(
  backendName: BranchStorageBackendName,
  env: NodeJS.ProcessEnv,
): BranchStorageBackend {
  switch (backendName) {
    case "apfs":
      return new ApfsBranchStorage({ basePath: resolveApfsBasePath(env) });
    case "zfs":
      return new ZfsBranchStorage(resolveZfsOptions(env));
  }
}
