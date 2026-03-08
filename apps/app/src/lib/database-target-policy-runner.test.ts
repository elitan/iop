import { afterEach, describe, expect, test } from "bun:test";
import { runDatabaseTargetPolicyScheduler } from "./database-target-policy-scheduler";

type ScaleToZeroTargetRow = {
  id: string;
  databaseId: string;
  createdAt: number;
  lastActivityAt: number | null;
  scaleToZeroMinutes: number | null;
};

const stopCalls: Array<{
  databaseId: string;
  targetId: string;
  stoppedReason?: "idle" | "failed" | null;
}> = [];

const deleteCalls: Array<{
  databaseId: string;
  targetId: string;
}> = [];

function resetState() {
  stopCalls.length = 0;
  deleteCalls.length = 0;
}

afterEach(function cleanup() {
  resetState();
});

describe("runDatabaseTargetPolicyScheduler", function describePolicyScheduler() {
  test("passes idle stopped reason when auto-sleep stops a branch", async function testIdleStopReason() {
    const now = Date.UTC(2026, 0, 1, 0, 30, 0);
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const scaleToZeroTargets: ScaleToZeroTargetRow[] = [
      {
        id: "dbt_1",
        databaseId: "db_1",
        createdAt,
        lastActivityAt: createdAt,
        scaleToZeroMinutes: 10,
      },
    ];

    await runDatabaseTargetPolicyScheduler({
      getActiveConnections: function getActiveConnections() {
        return 0;
      },
      getNow: function getNow() {
        return now;
      },
      listScaleToZeroTargets: async function listScaleToZeroTargets() {
        return scaleToZeroTargets;
      },
      listTtlTargets: async function listTtlTargets() {
        return [];
      },
      deleteTarget: async function deleteTarget(input: {
        databaseId: string;
        targetId: string;
      }) {
        deleteCalls.push(input);
      },
      stopTarget: async function stopTarget(input: {
        databaseId: string;
        targetId: string;
        stoppedReason?: "idle" | "failed" | null;
      }) {
        stopCalls.push(input);
      },
    });

    expect(stopCalls).toEqual([
      {
        databaseId: "db_1",
        targetId: "dbt_1",
        stoppedReason: "idle",
      },
    ]);
    expect(deleteCalls).toEqual([]);
  });
});
