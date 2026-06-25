import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import { runMigrations } from "./migrate";
import {
  buildObjectStorageConnectionSnippets,
  getGaragePermissions,
  normalizeBucketName,
  normalizeObjectStorageName,
  waitForObjectStorageDeploymentContainer,
} from "./object-storage";

runMigrations();

interface DeploymentFixture {
  projectId: string;
  environmentId: string;
  serviceId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(function onResolve(resolve) {
    setTimeout(resolve, ms);
  });
}

async function createDeploymentFixture(): Promise<DeploymentFixture> {
  const suffix = nanoid(8);
  const projectId = `proj-object-storage-${suffix}`;
  const environmentId = `env-object-storage-${suffix}`;
  const serviceId = `svc-object-storage-${suffix}`;
  const now = Date.now();

  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `object-storage-${suffix}`,
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
      name: `object-storage-${suffix}`,
      deployType: "image",
      serviceType: "object-storage",
      imageUrl: "nginx:alpine",
      envVars: "[]",
      createdAt: now,
    })
    .execute();

  return { projectId, environmentId, serviceId };
}

async function cleanupDeploymentFixture(
  fixture: DeploymentFixture,
): Promise<void> {
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

async function insertDeployment(
  fixture: DeploymentFixture,
  input?: { status?: "pending" | "failed"; buildLog?: string },
): Promise<string> {
  const deploymentId = `dep-object-storage-${nanoid(8)}`;
  await db
    .insertInto("deployments")
    .values({
      id: deploymentId,
      serviceId: fixture.serviceId,
      environmentId: fixture.environmentId,
      commitSha: "HEAD",
      status: input?.status ?? "pending",
      buildLog: input?.buildLog,
      createdAt: Date.now(),
    })
    .execute();
  return deploymentId;
}

describe("object storage naming", () => {
  test("normalizes display names into runtime-safe slugs", () => {
    expect(normalizeObjectStorageName("User Uploads")).toBe("user-uploads");
  });

  test("normalizes bucket names into S3-compatible aliases", () => {
    expect(normalizeBucketName("Avatars")).toBe("avatars");
    expect(normalizeBucketName("a")).toBe("a-s3");
  });
});

describe("waitForObjectStorageDeploymentContainer", function describeWait() {
  test("waits until the deployment records a running container", async function testWaits() {
    const fixture = await createDeploymentFixture();

    try {
      const deploymentId = await insertDeployment(fixture);
      const updatePromise = (async function updateDeploymentLater() {
        await sleep(20);
        await db
          .updateTable("deployments")
          .set({
            status: "running",
            containerId: "container-object-storage",
          })
          .where("id", "=", deploymentId)
          .execute();
      })();

      const containerId = await waitForObjectStorageDeploymentContainer(
        deploymentId,
        { timeoutMs: 1000, pollMs: 5 },
      );

      await updatePromise;
      expect(containerId).toBe("container-object-storage");
    } finally {
      await cleanupDeploymentFixture(fixture);
    }
  });

  test("surfaces failed deployment log context", async function testFailed() {
    const fixture = await createDeploymentFixture();

    try {
      const deploymentId = await insertDeployment(fixture, {
        status: "failed",
        buildLog: "Pulling image\nimage not found\n",
      });

      await expect(
        waitForObjectStorageDeploymentContainer(deploymentId, {
          timeoutMs: 100,
          pollMs: 5,
        }),
      ).rejects.toThrow("Object storage deployment failed: image not found");
    } finally {
      await cleanupDeploymentFixture(fixture);
    }
  });
});

describe("getGaragePermissions", () => {
  test("maps Frost key roles to Garage bucket permissions", () => {
    expect(getGaragePermissions("read-only")).toEqual({ read: true });
    expect(getGaragePermissions("read-write")).toEqual({
      read: true,
      write: true,
    });
    expect(getGaragePermissions("full")).toEqual({
      read: true,
      write: true,
      owner: true,
    });
  });
});

describe("buildObjectStorageConnectionSnippets", () => {
  test("builds copyable S3 settings for path-style clients", () => {
    const snippets = buildObjectStorageConnectionSnippets({
      endpoint: "https://s3.example.com",
      internalEndpoint: "http://s3-assets:3900",
      region: "auto",
      bucket: "assets",
      accessKeyId: "key-id",
      secretAccessKey: "secret",
    });

    expect(snippets.env).toContainEqual({
      key: "S3_FORCE_PATH_STYLE",
      value: "true",
    });
    expect(snippets.awsCli).toContain(
      "--endpoint-url 'https://s3.example.com'",
    );
    expect(snippets.javascript).toContain("forcePathStyle: true");
  });

  test("falls back to the internal endpoint when no external endpoint is ready", () => {
    const snippets = buildObjectStorageConnectionSnippets({
      endpoint: null,
      internalEndpoint: "http://s3-assets:3900",
      region: "auto",
      bucket: "assets",
      accessKeyId: "key-id",
      secretAccessKey: "secret",
    });

    expect(snippets.env).toContainEqual({
      key: "S3_ENDPOINT",
      value: "http://s3-assets:3900",
    });
    expect(snippets.javascript).toContain('endpoint: "http://s3-assets:3900"');
  });
});
