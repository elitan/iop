import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import { reconcileDeploymentRuntimeStatus } from "./deployment-runtime";
import { getDeployTimeoutError } from "./deployment-timeout";
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
});
