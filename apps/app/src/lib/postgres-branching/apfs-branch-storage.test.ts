import { describe, expect, test } from "bun:test";
import { buildApfsCloneArgs } from "./apfs-branch-storage";

describe("buildApfsCloneArgs", () => {
  test("builds cp clone args", () => {
    expect(buildApfsCloneArgs("/a/source", "/b/target")).toEqual([
      "-cR",
      "/a/source",
      "/b/target",
    ]);
  });
});
