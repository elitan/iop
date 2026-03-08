import { afterEach, describe, expect, mock, test } from "bun:test";

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

const executeQueue: unknown[][] = [];

function resetState() {
  stopCalls.length = 0;
  deleteCalls.length = 0;
  executeQueue.length = 0;
}

function buildQuery() {
  const query = {
    innerJoin: function innerJoin() {
      return query;
    },
    select: function select() {
      return query;
    },
    where: function where() {
      return query;
    },
    execute: async function execute() {
      return executeQueue.shift() ?? [];
    },
  };

  return query;
}

mock.module("./database-runtime", function mockDatabaseRuntime() {
  return {
    deleteDatabaseTarget: async function deleteDatabaseTarget(input: {
      databaseId: string;
      targetId: string;
    }) {
      deleteCalls.push(input);
    },
    stopDatabaseTarget: async function stopDatabaseTarget(input: {
      databaseId: string;
      targetId: string;
      stoppedReason?: "idle" | "failed" | null;
    }) {
      stopCalls.push(input);
    },
  };
});

mock.module("./database-target-gateway", function mockGateway() {
  return {
    getDatabaseTargetGatewayActiveConnections:
      function getDatabaseTargetGatewayActiveConnections() {
        return 0;
      },
  };
});

mock.module("./db", function mockDb() {
  return {
    db: {
      selectFrom: function selectFrom(table: string) {
        if (table !== "databaseTargets") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return buildQuery();
      },
    },
  };
});

const schedulerModulePromise = import("./database-target-policy-scheduler");

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

    executeQueue.push(scaleToZeroTargets, []);

    const { runDatabaseTargetPolicyScheduler } = await schedulerModulePromise;
    const realNow = Date.now;
    Date.now = function mockedNow() {
      return now;
    };

    try {
      await runDatabaseTargetPolicyScheduler();
    } finally {
      Date.now = realNow;
    }

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
