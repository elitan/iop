import { describe, expect, test } from "bun:test";
import {
  buildPostgresCheckpointCommand,
  createRollbackStack,
} from "./postgres-branch-runtime";

describe("createRollbackStack", () => {
  test("runs rollback steps in reverse order", async () => {
    const calls: string[] = [];
    const rollback = createRollbackStack();

    rollback.add(async () => {
      calls.push("storage");
    });
    rollback.add(async () => {
      calls.push("container");
    });

    await rollback.run();

    expect(calls).toEqual(["container", "storage"]);
  });

  test("reset-like failure executes staged cleanup", async () => {
    const calls: string[] = [];
    const rollback = createRollbackStack();

    calls.push("clone-staged");
    rollback.add(async () => {
      calls.push("cleanup-staged");
    });

    calls.push("stop-target");

    try {
      throw new Error("swap failed");
    } catch {
      await rollback.run();
    }

    expect(calls).toEqual(["clone-staged", "stop-target", "cleanup-staged"]);
  });
});

describe("buildPostgresCheckpointCommand", () => {
  test("builds docker exec psql checkpoint command", () => {
    const command = buildPostgresCheckpointCommand({
      containerName: "pg-main",
      username: "frost",
      password: "secret",
      database: "frost_main",
    });

    expect(command).toContain("docker exec");
    expect(command).toContain("CHECKPOINT;");
    expect(command).toContain("pg-main");
  });
});
