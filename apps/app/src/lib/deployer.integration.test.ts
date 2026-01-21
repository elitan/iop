import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import { deployService } from "./deployer";
import { removeNetwork, stopContainer } from "./docker";

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
