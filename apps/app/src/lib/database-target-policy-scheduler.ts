import { deleteDatabaseTarget, stopDatabaseTarget } from "./database-runtime";
import { getDatabaseTargetGatewayActiveConnections } from "./database-target-gateway";
import type { DatabaseTargetStoppedReason } from "./database-target-status";
import { db } from "./db";

const CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

type ScaleToZeroTarget = {
  id: string;
  databaseId: string;
  createdAt: number;
  lastActivityAt: number | null;
  scaleToZeroMinutes: number | null;
};

type TtlTarget = {
  id: string;
  databaseId: string;
  name: string;
  createdAt: number;
  ttlValue: number | null;
  ttlUnit: "hours" | "days" | null;
};

type StopTargetInput = {
  databaseId: string;
  targetId: string;
  stoppedReason?: DatabaseTargetStoppedReason | null;
};

type DeleteTargetInput = {
  databaseId: string;
  targetId: string;
};

type DatabaseTargetPolicySchedulerInput = {
  getNow?: () => number;
  listScaleToZeroTargets?: () => Promise<ScaleToZeroTarget[]>;
  listTtlTargets?: () => Promise<TtlTarget[]>;
  getActiveConnections?: (targetId: string) => number;
  stopTarget?: (input: StopTargetInput) => Promise<unknown>;
  deleteTarget?: (input: DeleteTargetInput) => Promise<unknown>;
  logAutoStopError?: (targetId: string, error: unknown) => void;
  logAutoDeleteError?: (targetId: string, error: unknown) => void;
};

export function isDatabaseTargetTtlExpired(input: {
  createdAt: number;
  ttlValue: number;
  ttlUnit: "hours" | "days";
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const multiplier =
    input.ttlUnit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return now - input.createdAt >= input.ttlValue * multiplier;
}

export function isDatabaseTargetIdleDue(input: {
  lastActivityAt: number | null;
  createdAt: number;
  scaleToZeroMinutes: number;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const lastActivityAt = input.lastActivityAt ?? input.createdAt;
  return now - lastActivityAt >= input.scaleToZeroMinutes * 60 * 1000;
}

async function listScaleToZeroTargets(): Promise<ScaleToZeroTarget[]> {
  return db
    .selectFrom("databaseTargets")
    .innerJoin("databases", "databases.id", "databaseTargets.databaseId")
    .select([
      "databaseTargets.id",
      "databaseTargets.databaseId",
      "databaseTargets.createdAt",
      "databaseTargets.lastActivityAt",
      "databaseTargets.scaleToZeroMinutes",
    ])
    .where("databaseTargets.kind", "=", "branch")
    .where("databaseTargets.name", "!=", "main")
    .where("databaseTargets.lifecycleStatus", "=", "active")
    .where("databaseTargets.scaleToZeroMinutes", "is not", null)
    .where("databases.engine", "=", "postgres")
    .execute();
}

async function listTtlTargets(): Promise<TtlTarget[]> {
  return db
    .selectFrom("databaseTargets")
    .innerJoin("databases", "databases.id", "databaseTargets.databaseId")
    .select([
      "databaseTargets.id",
      "databaseTargets.databaseId",
      "databaseTargets.name",
      "databaseTargets.createdAt",
      "databaseTargets.ttlValue",
      "databaseTargets.ttlUnit",
    ])
    .where("databaseTargets.kind", "=", "branch")
    .where("databaseTargets.name", "!=", "main")
    .where("databaseTargets.ttlValue", "is not", null)
    .where("databaseTargets.ttlUnit", "is not", null)
    .where("databases.engine", "=", "postgres")
    .execute();
}

function logAutoStopError(targetId: string, error: unknown): void {
  console.error(
    "[database-target-policy-scheduler] Failed to auto-stop target",
    {
      targetId,
      error,
    },
  );
}

function logAutoDeleteError(targetId: string, error: unknown): void {
  console.error(
    "[database-target-policy-scheduler] Failed to auto-delete target",
    {
      targetId,
      error,
    },
  );
}

async function runScaleToZeroPolicy(
  now: number,
  input: DatabaseTargetPolicySchedulerInput,
): Promise<void> {
  const targets = await (
    input.listScaleToZeroTargets ?? listScaleToZeroTargets
  )();
  const getActiveConnections =
    input.getActiveConnections ?? getDatabaseTargetGatewayActiveConnections;
  const stopTarget = input.stopTarget ?? stopDatabaseTarget;
  const onError = input.logAutoStopError ?? logAutoStopError;

  for (const target of targets) {
    if (target.scaleToZeroMinutes === null) {
      continue;
    }

    if (getActiveConnections(target.id) > 0) {
      continue;
    }

    if (
      !isDatabaseTargetIdleDue({
        lastActivityAt: target.lastActivityAt,
        createdAt: target.createdAt,
        scaleToZeroMinutes: target.scaleToZeroMinutes,
        now,
      })
    ) {
      continue;
    }

    try {
      await stopTarget({
        databaseId: target.databaseId,
        targetId: target.id,
        stoppedReason: "idle",
      });
    } catch (error) {
      onError(target.id, error);
    }
  }
}

async function runTtlPolicy(
  now: number,
  input: DatabaseTargetPolicySchedulerInput,
): Promise<void> {
  const targets = await (input.listTtlTargets ?? listTtlTargets)();
  const getActiveConnections =
    input.getActiveConnections ?? getDatabaseTargetGatewayActiveConnections;
  const deleteTarget = input.deleteTarget ?? deleteDatabaseTarget;
  const onError = input.logAutoDeleteError ?? logAutoDeleteError;

  for (const target of targets) {
    if (target.ttlValue === null || target.ttlUnit === null) {
      continue;
    }

    if (
      !isDatabaseTargetTtlExpired({
        createdAt: target.createdAt,
        ttlValue: target.ttlValue,
        ttlUnit: target.ttlUnit,
        now,
      })
    ) {
      continue;
    }

    if (getActiveConnections(target.id) > 0) {
      continue;
    }

    try {
      await deleteTarget({
        databaseId: target.databaseId,
        targetId: target.id,
      });
    } catch (error) {
      onError(target.id, error);
    }
  }
}

export async function runDatabaseTargetPolicyScheduler(
  input: DatabaseTargetPolicySchedulerInput = {},
): Promise<void> {
  const now = input.getNow ? input.getNow() : Date.now();
  await runScaleToZeroPolicy(now, input);
  await runTtlPolicy(now, input);
}

function checkAndRun(): void {
  runDatabaseTargetPolicyScheduler().catch(function onError(error) {
    console.error("[database-target-policy-scheduler] Error:", error);
  });
}

export function startDatabaseTargetPolicyScheduler(): void {
  if (intervalId) {
    return;
  }

  intervalId = setInterval(checkAndRun, CHECK_INTERVAL_MS);
  checkAndRun();
  console.log("[database-target-policy-scheduler] Started");
}

export function stopDatabaseTargetPolicyScheduler(): void {
  if (!intervalId) {
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  console.log("[database-target-policy-scheduler] Stopped");
}
