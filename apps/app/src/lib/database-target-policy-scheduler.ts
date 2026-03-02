import { deleteDatabaseTarget, stopDatabaseTarget } from "./database-runtime";
import { getDatabaseTargetGatewayActiveConnections } from "./database-target-gateway";
import { db } from "./db";

const CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

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

async function runScaleToZeroPolicy(now: number): Promise<void> {
  const targets = await db
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

  for (const target of targets) {
    if (target.scaleToZeroMinutes === null) {
      continue;
    }

    if (getDatabaseTargetGatewayActiveConnections(target.id) > 0) {
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
      await stopDatabaseTarget({
        databaseId: target.databaseId,
        targetId: target.id,
      });
    } catch (error) {
      console.error(
        "[database-target-policy-scheduler] Failed to auto-stop target",
        {
          targetId: target.id,
          error,
        },
      );
    }
  }
}

async function runTtlPolicy(now: number): Promise<void> {
  const targets = await db
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

    if (getDatabaseTargetGatewayActiveConnections(target.id) > 0) {
      continue;
    }

    try {
      await deleteDatabaseTarget({
        databaseId: target.databaseId,
        targetId: target.id,
      });
    } catch (error) {
      console.error(
        "[database-target-policy-scheduler] Failed to auto-delete target",
        {
          targetId: target.id,
          error,
        },
      );
    }
  }
}

export async function runDatabaseTargetPolicyScheduler(): Promise<void> {
  const now = Date.now();
  await runScaleToZeroPolicy(now);
  await runTtlPolicy(now);
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
