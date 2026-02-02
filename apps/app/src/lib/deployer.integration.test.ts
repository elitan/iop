import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import { deployService } from "./deployer";
import { getContainerStatus, removeNetwork, stopContainer } from "./docker";

const TEST_PROJECT_ID = `test-${nanoid(8)}`;
const TEST_ENV_ID = `test-${nanoid(8)}`;
const TEST_SERVICE_ID = `test-${nanoid(8)}`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeDockerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function waitForDeploymentStatus(
  deploymentId: string,
  targetStatuses: string[],
  timeoutMs = 120000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const deployment = await db
      .selectFrom("deployments")
      .select("status")
      .where("id", "=", deploymentId)
      .executeTakeFirst();

    if (deployment && targetStatuses.includes(deployment.status)) {
      return deployment.status;
    }
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for deployment ${deploymentId}`);
}

describe("deployment race conditions", () => {
  beforeAll(async () => {
    const now = Date.now();
    await db
      .insertInto("projects")
      .values({
        id: TEST_PROJECT_ID,
        name: "race-test",
        envVars: "[]",
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("environments")
      .values({
        id: TEST_ENV_ID,
        projectId: TEST_PROJECT_ID,
        name: "production",
        type: "production",
        isEphemeral: false,
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("services")
      .values({
        id: TEST_SERVICE_ID,
        environmentId: TEST_ENV_ID,
        name: "race-test-svc",
        deployType: "image",
        imageUrl: "nginx:alpine",
        containerPort: 80,
        envVars: "[]",
        createdAt: now,
      })
      .execute();
  }, 60000);

  afterAll(async () => {
    const deployments = await db
      .selectFrom("deployments")
      .select("id")
      .where("serviceId", "=", TEST_SERVICE_ID)
      .execute();

    for (const d of deployments) {
      const containerName = sanitizeDockerName(
        `frost-${TEST_SERVICE_ID}-${d.id}`,
      );
      await stopContainer(containerName);
    }

    await removeNetwork(sanitizeDockerName(`frost-net-${TEST_PROJECT_ID}`));

    await db
      .updateTable("services")
      .set({ currentDeploymentId: null })
      .where("id", "=", TEST_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", TEST_SERVICE_ID)
      .execute();
    await db.deleteFrom("services").where("id", "=", TEST_SERVICE_ID).execute();
    await db.deleteFrom("projects").where("id", "=", TEST_PROJECT_ID).execute();
  });

  test("concurrent deploys cancel previous", async () => {
    const deploy1Id = await deployService(TEST_SERVICE_ID);
    const deploy2Id = await deployService(TEST_SERVICE_ID);

    const status2 = await waitForDeploymentStatus(deploy2Id, [
      "running",
      "failed",
    ]);
    expect(status2).toBe("running");

    const deploy1 = await db
      .selectFrom("deployments")
      .select("status")
      .where("id", "=", deploy1Id)
      .executeTakeFirst();

    expect(deploy1?.status).toBe("cancelled");
  }, 120000);

  test("rapid deploys don't leave zombie containers", async () => {
    const deploy1Id = await deployService(TEST_SERVICE_ID);
    const deploy2Id = await deployService(TEST_SERVICE_ID);
    const deploy3Id = await deployService(TEST_SERVICE_ID);

    const status3 = await waitForDeploymentStatus(deploy3Id, [
      "running",
      "failed",
    ]);
    expect(status3).toBe("running");

    const deployments = await db
      .selectFrom("deployments")
      .select(["id", "status"])
      .where("id", "in", [deploy1Id, deploy2Id, deploy3Id])
      .execute();

    const runningCount = deployments.filter(
      (d) => d.status === "running",
    ).length;
    const cancelledCount = deployments.filter(
      (d) => d.status === "cancelled",
    ).length;

    expect(runningCount).toBe(1);
    expect(cancelledCount).toBe(2);
  }, 120000);
});

const ZD_PROJECT_ID = `test-zd-${nanoid(8)}`;
const ZD_ENV_ID = `test-zd-${nanoid(8)}`;
const ZD_SERVICE_ID = `test-zd-${nanoid(8)}`;

describe("zero-downtime deploy", () => {
  beforeAll(async () => {
    const now = Date.now();
    await db
      .insertInto("projects")
      .values({
        id: ZD_PROJECT_ID,
        name: "zd-test",
        envVars: "[]",
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("environments")
      .values({
        id: ZD_ENV_ID,
        projectId: ZD_PROJECT_ID,
        name: "production",
        type: "production",
        isEphemeral: false,
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("services")
      .values({
        id: ZD_SERVICE_ID,
        environmentId: ZD_ENV_ID,
        name: "zd-test-svc",
        deployType: "image",
        imageUrl: "nginx:alpine",
        containerPort: 80,
        envVars: "[]",
        drainTimeout: 0,
        createdAt: now,
      })
      .execute();
  }, 60000);

  afterAll(async () => {
    const deployments = await db
      .selectFrom("deployments")
      .select("id")
      .where("serviceId", "=", ZD_SERVICE_ID)
      .execute();

    for (const d of deployments) {
      const containerName = sanitizeDockerName(
        `frost-${ZD_SERVICE_ID}-${d.id}`,
      );
      await stopContainer(containerName);
    }

    await removeNetwork(
      sanitizeDockerName(`frost-net-${ZD_PROJECT_ID}-${ZD_ENV_ID}`),
    );

    await db
      .updateTable("services")
      .set({ currentDeploymentId: null })
      .where("id", "=", ZD_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", ZD_SERVICE_ID)
      .execute();
    await db.deleteFrom("services").where("id", "=", ZD_SERVICE_ID).execute();
    await db.deleteFrom("environments").where("id", "=", ZD_ENV_ID).execute();
    await db.deleteFrom("projects").where("id", "=", ZD_PROJECT_ID).execute();
  });

  test("old container stays alive until after traffic switch", async () => {
    const deploy1Id = await deployService(ZD_SERVICE_ID);
    const status1 = await waitForDeploymentStatus(deploy1Id, [
      "running",
      "failed",
    ]);
    expect(status1).toBe("running");

    const v1 = await db
      .selectFrom("deployments")
      .select("containerId")
      .where("id", "=", deploy1Id)
      .executeTakeFirst();

    const deploy2Id = await deployService(ZD_SERVICE_ID);
    const status2 = await waitForDeploymentStatus(deploy2Id, [
      "running",
      "failed",
    ]);
    expect(status2).toBe("running");

    await sleep(5000);

    const v1After = await db
      .selectFrom("deployments")
      .select("status")
      .where("id", "=", deploy1Id)
      .executeTakeFirst();
    expect(v1After?.status).toBe("stopped");

    if (v1?.containerId) {
      const containerStatus = await getContainerStatus(v1.containerId);
      expect(["exited", "unknown"]).toContain(containerStatus);
    }
  }, 180000);

  test("failed health check keeps old container running", async () => {
    await db
      .updateTable("services")
      .set({ imageUrl: "nginx:alpine", currentDeploymentId: null })
      .where("id", "=", ZD_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", ZD_SERVICE_ID)
      .execute();

    const deploy1Id = await deployService(ZD_SERVICE_ID);
    const status1 = await waitForDeploymentStatus(deploy1Id, [
      "running",
      "failed",
    ]);
    expect(status1).toBe("running");

    const v1 = await db
      .selectFrom("deployments")
      .select("containerId")
      .where("id", "=", deploy1Id)
      .executeTakeFirst();

    await db
      .updateTable("services")
      .set({
        imageUrl: "nginx:alpine",
        healthCheckPath: "/nonexistent-path-that-will-fail",
        healthCheckTimeout: 5,
      })
      .where("id", "=", ZD_SERVICE_ID)
      .execute();

    const deploy2Id = await deployService(ZD_SERVICE_ID);
    const status2 = await waitForDeploymentStatus(deploy2Id, [
      "running",
      "failed",
    ]);
    expect(status2).toBe("failed");

    if (v1?.containerId) {
      const containerStatus = await getContainerStatus(v1.containerId);
      expect(containerStatus).toBe("running");
    }

    const service = await db
      .selectFrom("services")
      .select("currentDeploymentId")
      .where("id", "=", ZD_SERVICE_ID)
      .executeTakeFirst();
    expect(service?.currentDeploymentId).toBe(deploy1Id);

    await db
      .updateTable("services")
      .set({ healthCheckPath: null, healthCheckTimeout: null })
      .where("id", "=", ZD_SERVICE_ID)
      .execute();
  }, 180000);
});

const DRAIN_PROJECT_ID = `test-drain-${nanoid(8)}`;
const DRAIN_ENV_ID = `test-drain-${nanoid(8)}`;
const DRAIN_SERVICE_ID = `test-drain-${nanoid(8)}`;

describe("drain and replica cleanup", () => {
  beforeAll(async () => {
    const now = Date.now();
    await db
      .insertInto("projects")
      .values({
        id: DRAIN_PROJECT_ID,
        name: "drain-test",
        envVars: "[]",
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("environments")
      .values({
        id: DRAIN_ENV_ID,
        projectId: DRAIN_PROJECT_ID,
        name: "production",
        type: "production",
        isEphemeral: false,
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("services")
      .values({
        id: DRAIN_SERVICE_ID,
        environmentId: DRAIN_ENV_ID,
        name: "drain-test-svc",
        deployType: "image",
        imageUrl: "nginx:alpine",
        containerPort: 80,
        envVars: "[]",
        drainTimeout: 0,
        createdAt: now,
      })
      .execute();
  }, 60000);

  afterAll(async () => {
    const deployments = await db
      .selectFrom("deployments")
      .select("id")
      .where("serviceId", "=", DRAIN_SERVICE_ID)
      .execute();

    for (const d of deployments) {
      const replicas = await db
        .selectFrom("replicas")
        .select("containerId")
        .where("deploymentId", "=", d.id)
        .execute();

      for (const r of replicas) {
        if (r.containerId) {
          await stopContainer(r.containerId).catch(() => {});
        }
      }

      const containerName = sanitizeDockerName(
        `frost-${DRAIN_SERVICE_ID}-${d.id}`,
      );
      await stopContainer(containerName).catch(() => {});
    }

    await removeNetwork(
      sanitizeDockerName(`frost-net-${DRAIN_PROJECT_ID}-${DRAIN_ENV_ID}`),
    );

    await db
      .updateTable("services")
      .set({ currentDeploymentId: null })
      .where("id", "=", DRAIN_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", DRAIN_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("services")
      .where("id", "=", DRAIN_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("environments")
      .where("id", "=", DRAIN_ENV_ID)
      .execute();
    await db
      .deleteFrom("projects")
      .where("id", "=", DRAIN_PROJECT_ID)
      .execute();
  });

  test("cancelling during drain keeps old container alive", async () => {
    await db
      .updateTable("services")
      .set({
        drainTimeout: 3,
        replicaCount: 1,
        currentDeploymentId: null,
      })
      .where("id", "=", DRAIN_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", DRAIN_SERVICE_ID)
      .execute();

    const deploy1Id = await deployService(DRAIN_SERVICE_ID);
    const status1 = await waitForDeploymentStatus(deploy1Id, [
      "running",
      "failed",
    ]);
    expect(status1).toBe("running");

    const v1 = await db
      .selectFrom("deployments")
      .select("containerId")
      .where("id", "=", deploy1Id)
      .executeTakeFirst();

    const deploy2Id = await deployService(DRAIN_SERVICE_ID);
    const status2 = await waitForDeploymentStatus(deploy2Id, [
      "running",
      "failed",
    ]);
    expect(status2).toBe("running");

    await db
      .updateTable("deployments")
      .set({ status: "cancelled" })
      .where("id", "=", deploy2Id)
      .execute();

    await sleep(5000);

    if (v1?.containerId) {
      const containerStatus = await getContainerStatus(v1.containerId);
      expect(containerStatus).toBe("running");
    }
  }, 180000);

  test("multi-replica drain stops all old replicas", async () => {
    await db
      .updateTable("services")
      .set({
        replicaCount: 2,
        drainTimeout: 0,
        currentDeploymentId: null,
        imageUrl: "nginx:alpine",
      })
      .where("id", "=", DRAIN_SERVICE_ID)
      .execute();
    await db
      .deleteFrom("deployments")
      .where("serviceId", "=", DRAIN_SERVICE_ID)
      .execute();

    const deploy1Id = await deployService(DRAIN_SERVICE_ID);
    const status1 = await waitForDeploymentStatus(deploy1Id, [
      "running",
      "failed",
    ]);
    expect(status1).toBe("running");

    const v1Replicas = await db
      .selectFrom("replicas")
      .selectAll()
      .where("deploymentId", "=", deploy1Id)
      .execute();
    expect(v1Replicas).toHaveLength(2);
    expect(v1Replicas.every((r) => r.status === "running")).toBe(true);

    const deploy2Id = await deployService(DRAIN_SERVICE_ID);
    const status2 = await waitForDeploymentStatus(deploy2Id, [
      "running",
      "failed",
    ]);
    expect(status2).toBe("running");

    await sleep(5000);

    const v1ReplicasAfter = await db
      .selectFrom("replicas")
      .selectAll()
      .where("deploymentId", "=", deploy1Id)
      .execute();
    expect(v1ReplicasAfter.every((r) => r.status === "stopped")).toBe(true);

    for (const r of v1ReplicasAfter) {
      if (r.containerId) {
        const containerStatus = await getContainerStatus(r.containerId);
        expect(["exited", "unknown"]).toContain(containerStatus);
      }
    }
  }, 180000);
});
