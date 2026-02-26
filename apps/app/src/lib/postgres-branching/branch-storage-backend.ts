export type BranchStorageBackendName = "apfs" | "zfs";

export interface BranchStorageMetadata {
  storageBackend: BranchStorageBackendName;
  storageRef: string;
}

export interface BranchStorageHandle extends BranchStorageMetadata {
  mountPath: string;
}

export interface BranchStorageBackend {
  readonly name: BranchStorageBackendName;
  assertReady(): Promise<void>;
  createEmptyStorage(storageRef: string): Promise<BranchStorageHandle>;
  cloneStorage(
    sourceStorageRef: string,
    targetStorageRef: string,
  ): Promise<BranchStorageHandle>;
  swapStorage(liveStorageRef: string, stagedStorageRef: string): Promise<void>;
  removeStorage(storageRef: string): Promise<void>;
  resolveMountPath(storageRef: string): Promise<string>;
}
