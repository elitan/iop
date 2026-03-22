import { describe, expect, test } from "bun:test";
import { getDatabaseRuntimeState } from "./database-runtime-status";

describe("getDatabaseRuntimeState", () => {
  test("returns online for an active main target", () => {
    expect(
      getDatabaseRuntimeState({
        mainTarget: { lifecycleStatus: "active" },
        latestDeployment: { status: "running" },
      }),
    ).toEqual({
      runtimeStatus: "online",
      attentionStatus: null,
    });
  });

  test("returns offline for a stopped main target", () => {
    expect(
      getDatabaseRuntimeState({
        mainTarget: { lifecycleStatus: "stopped" },
        latestDeployment: { status: "stopped" },
      }),
    ).toEqual({
      runtimeStatus: "offline",
      attentionStatus: null,
    });
  });

  test("returns online with attention after a failed deploy on an active target", () => {
    expect(
      getDatabaseRuntimeState({
        mainTarget: { lifecycleStatus: "active" },
        latestDeployment: { status: "failed" },
      }),
    ).toEqual({
      runtimeStatus: "online",
      attentionStatus: "last-deploy-failed",
    });
  });
});
