import { describe, expect, test } from "bun:test";
import {
  createBranchStorageBackendByName,
  resolveApfsBasePath,
  resolveBranchStorageBackendName,
  resolveZfsOptions,
} from "./backend-factory";

describe("resolveBranchStorageBackendName", () => {
  test("returns apfs on macOS", () => {
    expect(resolveBranchStorageBackendName("darwin")).toBe("apfs");
  });

  test("returns zfs on linux", () => {
    expect(resolveBranchStorageBackendName("linux")).toBe("zfs");
  });

  test("throws on unsupported platform", () => {
    expect(() => resolveBranchStorageBackendName("win32")).toThrow(
      "Postgres branching is only supported",
    );
  });
});

describe("resolveApfsBasePath", () => {
  test("uses env override", () => {
    expect(
      resolveApfsBasePath({
        NODE_ENV: "test",
        FROST_POSTGRES_APFS_BASE: "/tmp/custom-apfs",
      }),
    ).toBe("/tmp/custom-apfs");
  });
});

describe("resolveZfsOptions", () => {
  test("uses defaults", () => {
    expect(resolveZfsOptions({ NODE_ENV: "test" })).toEqual({
      pool: "",
      datasetBase: "frost/databases",
      mountBase: "/opt/frost/data/postgres/zfs",
    });
  });

  test("uses env values", () => {
    expect(
      resolveZfsOptions({
        NODE_ENV: "test",
        FROST_POSTGRES_ZFS_POOL: "tank",
        FROST_POSTGRES_ZFS_DATASET_BASE: "frost/db",
        FROST_POSTGRES_ZFS_MOUNT_BASE: "/data/zfs",
      }),
    ).toEqual({
      pool: "tank",
      datasetBase: "frost/db",
      mountBase: "/data/zfs",
    });
  });
});

describe("createBranchStorageBackendByName", () => {
  test("creates apfs backend", () => {
    const backend = createBranchStorageBackendByName("apfs", {
      NODE_ENV: "test",
      FROST_POSTGRES_APFS_BASE: "/tmp/apfs-base",
    });
    expect(backend.name).toBe("apfs");
  });

  test("creates zfs backend", () => {
    const backend = createBranchStorageBackendByName("zfs", {
      NODE_ENV: "test",
      FROST_POSTGRES_ZFS_POOL: "tank",
      FROST_POSTGRES_ZFS_DATASET_BASE: "frost/db",
      FROST_POSTGRES_ZFS_MOUNT_BASE: "/tmp/zfs",
    });
    expect(backend.name).toBe("zfs");
  });
});
