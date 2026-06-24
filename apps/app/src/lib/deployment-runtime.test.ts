import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import {
  reconcileDeploymentRuntimeStatus,
  reconcileDeploymentStartupState,
  resetDeploymentRuntimeDockerForTests,
  setDeploymentRuntimeDockerForTests,
} from "./deployment-runtime";
import {
  getDeployTimeoutError,
  getDeployTimeoutMs,
} from "./deployment-timeout";
import { runMigrations } from "./migrate";

runMigrations();

interface TestFixture {
  projectId: string;
  environmentId: string;
  serviceId: string;
}

async function createFixture(): Promise<TestFixture> {
  const suffix = nanoid(8);
  const projectId = `proj-deploy-runtime-${suffix}`;
  const environmentId = `env-deploy-runtime-${suffix}`;
  const serviceId = `svc-deploy-runtime-${suffix}`;
  const now = Date.now();

  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `deploy-runtime-${suffix}`,
      envVars: "[]",
      createdAt: now,
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: environmentId,
      projectId,
      name: "production",
      type: "production",
      isEphemeral: false,
      createdAt: now,
    })
    .execute();

  await db
    .insertInto("services")
    .values({
      id: serviceId,
      environmentId,
      name: `deploy-runtime-${suffix}`,
      deployType: "image",
      imageUrl: "nginx:alpine",
      envVars: "[]",
      createdAt: now,
    })
    .execute();

  return { projectId, environmentId, serviceId };
}

async function cleanupFixture(fixture: TestFixture): Promise<void> {
  await db
    .updateTable("services")
    .set({ currentDeploymentId: null })
    .where("id", "=", fixture.serviceId)
    .execute();

  await db
    .deleteFrom("deployments")
    .where("serviceId", "=", fixture.serviceId)
    .execute();

  await db.deleteFrom("services").where("id", "=", fixture.serviceId).execute();
  await db
    .deleteFrom("environments")
    .where("id", "=", fixture.environmentId)
    .execute();
  await db.deleteFrom("projects").where("id", "=", fixture.projectId).execute();
}

describe("reconcileDeploymentRuntimeStatus", function describeRuntimeStatus() {
  test("fails stale in-progress deployments", async function testStaleDeploy() {
    const fixture = await createFixture();

    try {
      const deploymentId = `dep-deploy-runtime-${nanoid(8)}`;
      await db
        .insertInto("deployments")
        .values({
          id: deploymentId,
          serviceId: fixture.serviceId,
          environmentId: fixture.environmentId,
          commitSha: "HEAD",
          status: "building",
          createdAt: Date.now() - 31 * 60 * 1000,
        })
        .execute();

      const deployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      const reconciled = await reconcileDeploymentRuntimeStatus(
        deployment ?? null,
      );

      expect(reconciled?.status).toBe("failed");
      expect(reconciled?.errorMessage).toBe(getDeployTimeoutError());
      expect(typeof reconciled?.finishedAt).toBe("number");

      const persisted = await db
        .selectFrom("deployments")
        .select(["status", "errorMessage", "finishedAt"])
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      expect(persisted?.status).toBe("failed");
      expect(persisted?.errorMessage).toBe(getDeployTimeoutError());
      expect(typeof persisted?.finishedAt).toBe("number");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  test("startup fails abandoned in-progress deployment", async function testStartupDeploy() {
    const fixture = await createFixture();
    const stoppedContainers: string[] = [];
    const stoppedLabels: string[] = [];

    try {
      const deploymentId = `dep-deploy-runtime-${nanoid(8)}`;
      const replicaId = `rep-deploy-runtime-${nanoid(8)}`;
      const now = Date.now();
      const staleCreatedAt = now - getDeployTimeoutMs() - 1000;

      await db
        .insertInto("deployments")
        .values({
          id: deploymentId,
          serviceId: fixture.serviceId,
          environmentId: fixture.environmentId,
          commitSha: "HEAD",
          status: "deploying",
          createdAt: staleCreatedAt,
        })
        .execute();

      await db
        .insertInto("deploymentLocks")
        .values({
          serviceId: fixture.serviceId,
          deploymentId,
          claimToken: "test-claim",
          claimedAt: now,
        })
        .execute();

      await db
        .insertInto("replicas")
        .values({
          id: replicaId,
          deploymentId,
          replicaIndex: 0,
          containerId: "known-container",
          hostPort: 19001,
          status: "running",
        })
        .execute();

      await db
        .updateTable("services")
        .set({ currentDeploymentId: deploymentId })
        .where("id", "=", fixture.serviceId)
        .execute();

      setDeploymentRuntimeDockerForTests({
        listFrostContainers: async function listFrostContainers() {
          return [
            {
              id: "orphan-container",
              name: "orphan-container",
              status: "running",
              labels: {
                "frost.managed": "true",
                "frost.deployment.id": deploymentId,
              },
            },
          ];
        },
        stopContainer: async function stopContainer(containerId) {
          stoppedContainers.push(containerId);
        },
        stopContainersByLabel: async function stopContainersByLabel(
          name,
          value,
        ) {
          stoppedLabels.push(`${name}=${value}`);
        },
      });

      const result = await reconcileDeploymentStartupState();

      expect(result.failedDeployments).toBeGreaterThanOrEqual(1);
      expect(result.stoppedOrphanContainers).toBeGreaterThanOrEqual(1);
      expect(stoppedLabels).toContain(`frost.deployment.id=${deploymentId}`);
      expect(stoppedContainers).toContain("known-container");
      expect(stoppedContainers).toContain("orphan-container");

      const deployment = await db
        .selectFrom("deployments")
        .select(["status", "errorMessage", "finishedAt"])
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      expect(deployment?.status).toBe("failed");
      expect(deployment?.errorMessage).toBe(getDeployTimeoutError());
      expect(typeof deployment?.finishedAt).toBe("number");

      const lock = await db
        .selectFrom("deploymentLocks")
        .select("serviceId")
        .where("deploymentId", "=", deploymentId)
        .executeTakeFirst();
      expect(lock).toBeUndefined();

      const service = await db
        .selectFrom("services")
        .select("currentDeploymentId")
        .where("id", "=", fixture.serviceId)
        .executeTakeFirst();
      expect(service?.currentDeploymentId).toBeNull();
    } finally {
      resetDeploymentRuntimeDockerForTests();
      await cleanupFixture(fixture);
    }
  });

  test("startup keeps fresh in-progress deployment containers", async function testFreshStartupDeploy() {
    const fixture = await createFixture();
    const stoppedContainers: string[] = [];
    const stoppedLabels: string[] = [];

    try {
      const deploymentId = `dep-deploy-runtime-${nanoid(8)}`;
      const now = Date.now();

      await db
        .insertInto("deployments")
        .values({
          id: deploymentId,
          serviceId: fixture.serviceId,
          environmentId: fixture.environmentId,
          commitSha: "HEAD",
          status: "deploying",
          createdAt: now,
        })
        .execute();

      setDeploymentRuntimeDockerForTests({
        listFrostContainers: async function listFrostContainers() {
          return [
            {
              id: "fresh-container",
              name: "fresh-container",
              status: "running",
              labels: {
                "frost.managed": "true",
                "frost.deployment.id": deploymentId,
              },
            },
          ];
        },
        stopContainer: async function stopContainer(containerId) {
          stoppedContainers.push(containerId);
        },
        stopContainersByLabel: async function stopContainersByLabel(
          name,
          value,
        ) {
          stoppedLabels.push(`${name}=${value}`);
        },
      });

      const result = await reconcileDeploymentStartupState();

      expect(result.failedDeployments).toBe(0);
      expect(result.stoppedOrphanContainers).toBe(0);
      expect(stoppedContainers).toEqual([]);
      expect(stoppedLabels).toEqual([]);

      const deployment = await db
        .selectFrom("deployments")
        .select(["status", "errorMessage", "finishedAt"])
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      expect(deployment?.status).toBe("deploying");
      expect(deployment?.errorMessage).toBeNull();
      expect(deployment?.finishedAt).toBeNull();
    } finally {
      resetDeploymentRuntimeDockerForTests();
      await cleanupFixture(fixture);
    }
  });
});
