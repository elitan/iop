import { ORPCError } from "@orpc/server";
import { db } from "@/lib/db";
import {
  DEMO_MODE_LIMITS,
  getDemoModeBlockedMessage,
  isDemoCpuLimitAllowed,
  isDemoMemoryLimitAllowed,
  isDemoMode,
} from "@/lib/demo-mode";

interface DemoResourceInput {
  cpuLimit?: number | null;
  memoryLimit?: string | null;
  replicaCount?: number | null;
}

function throwDemoError(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

export function assertDemoWriteAllowed(target: string): void {
  if (!isDemoMode()) return;
  throwDemoError(getDemoModeBlockedMessage(target));
}

export async function assertDemoProjectCreateAllowed(): Promise<void> {
  if (!isDemoMode()) return;

  const row = await db
    .selectFrom("projects")
    .select(db.fn.count("id").as("count"))
    .executeTakeFirst();
  const count = Number(row?.count ?? 0);

  if (count >= DEMO_MODE_LIMITS.maxProjects) {
    throwDemoError(
      `demo limit reached: max ${DEMO_MODE_LIMITS.maxProjects} projects`,
    );
  }
}

export async function assertDemoEnvironmentCreateAllowed(
  projectId: string,
): Promise<void> {
  if (!isDemoMode()) return;

  const row = await db
    .selectFrom("environments")
    .select(db.fn.count("id").as("count"))
    .where("projectId", "=", projectId)
    .executeTakeFirst();
  const count = Number(row?.count ?? 0);

  if (count >= DEMO_MODE_LIMITS.maxEnvironmentsPerProject) {
    throwDemoError(
      `demo limit reached: max ${DEMO_MODE_LIMITS.maxEnvironmentsPerProject} environments per project`,
    );
  }
}

export async function assertDemoServiceCreateAllowed(
  environmentId: string,
  requestedCount = 1,
): Promise<void> {
  if (!isDemoMode()) return;

  const row = await db
    .selectFrom("services")
    .select(db.fn.count("id").as("count"))
    .where("environmentId", "=", environmentId)
    .executeTakeFirst();
  const count = Number(row?.count ?? 0);

  if (count + requestedCount > DEMO_MODE_LIMITS.maxServicesPerEnvironment) {
    throwDemoError(
      `demo limit reached: max ${DEMO_MODE_LIMITS.maxServicesPerEnvironment} services per environment`,
    );
  }
}

export function assertDemoResourceLimits(input: DemoResourceInput): void {
  if (!isDemoMode()) return;

  if (
    input.replicaCount !== null &&
    input.replicaCount !== undefined &&
    input.replicaCount > DEMO_MODE_LIMITS.maxReplicaCount
  ) {
    throwDemoError(
      `demo limit reached: max ${DEMO_MODE_LIMITS.maxReplicaCount} replica`,
    );
  }

  if (!isDemoCpuLimitAllowed(input.cpuLimit)) {
    throwDemoError(
      `demo limit reached: max cpu limit ${DEMO_MODE_LIMITS.maxCpuLimit}`,
    );
  }

  if (!isDemoMemoryLimitAllowed(input.memoryLimit)) {
    throwDemoError("demo limit reached: max memory limit 2g");
  }
}

export async function assertDemoDeployRateLimit(
  serviceId: string,
): Promise<void> {
  if (!isDemoMode()) return;

  const fromTimestamp = Date.now() - DEMO_MODE_LIMITS.deployWindowMs;
  const row = await db
    .selectFrom("deployments")
    .select(db.fn.count("id").as("count"))
    .where("serviceId", "=", serviceId)
    .where("createdAt", ">=", fromTimestamp)
    .executeTakeFirst();
  const count = Number(row?.count ?? 0);

  if (count >= DEMO_MODE_LIMITS.deploysPerServiceWindow) {
    throwDemoError(
      `demo limit reached: max ${DEMO_MODE_LIMITS.deploysPerServiceWindow} deploys per service per 10 minutes`,
    );
  }
}
