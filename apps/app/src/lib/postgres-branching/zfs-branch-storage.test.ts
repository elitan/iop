import { describe, expect, test } from "bun:test";
import {
  buildZfsCloneArgs,
  buildZfsCreateArgs,
  buildZfsDatasetPath,
  buildZfsMountPath,
  normalizeDatasetBase,
  normalizeStorageRef,
} from "./zfs-branch-storage";

describe("normalizeDatasetBase", () => {
  test("trims slashes", () => {
    expect(normalizeDatasetBase("/frost/databases/")).toBe("frost/databases");
  });
});

describe("normalizeStorageRef", () => {
  test("trims slashes", () => {
    expect(normalizeStorageRef("/db/target/live/")).toBe("db/target/live");
  });
});

describe("buildZfsDatasetPath", () => {
  test("builds dataset path", () => {
    expect(buildZfsDatasetPath("tank", "frost/databases", "a/b/live")).toBe(
      "tank/frost/databases/a/b/live",
    );
  });
});

describe("buildZfsMountPath", () => {
  test("builds mount path", () => {
    expect(buildZfsMountPath("/opt/frost/data/postgres/zfs", "a/b/live")).toBe(
      "/opt/frost/data/postgres/zfs/a/b/live",
    );
  });
});

describe("buildZfsCreateArgs", () => {
  test("includes tuned properties", () => {
    expect(
      buildZfsCreateArgs(
        "tank/frost/databases/a/b/live",
        "/opt/frost/data/postgres/zfs/a/b/live",
      ),
    ).toEqual([
      "create",
      "-p",
      "-o",
      "compression=lz4",
      "-o",
      "recordsize=8k",
      "-o",
      "atime=off",
      "-o",
      "mountpoint=/opt/frost/data/postgres/zfs/a/b/live",
      "tank/frost/databases/a/b/live",
    ]);
  });
});

describe("buildZfsCloneArgs", () => {
  test("includes tuned properties", () => {
    expect(
      buildZfsCloneArgs(
        "tank/frost/databases/a/b/live@frost-1",
        "tank/frost/databases/a/c/live",
        "/opt/frost/data/postgres/zfs/a/c/live",
      ),
    ).toEqual([
      "clone",
      "-p",
      "-o",
      "compression=lz4",
      "-o",
      "recordsize=8k",
      "-o",
      "atime=off",
      "-o",
      "mountpoint=/opt/frost/data/postgres/zfs/a/c/live",
      "tank/frost/databases/a/b/live@frost-1",
      "tank/frost/databases/a/c/live",
    ]);
  });
});
