import { nanoid } from "nanoid";
import { encrypt } from "./crypto";
import { db } from "./db";
import type { createObjectStorage } from "./object-storage";

export interface DeploymentFixture {
  projectId: string;
  environmentId: string;
  serviceId: string;
}

export interface ObjectStorageFixture extends DeploymentFixture {
  deploymentId: string;
  objectStorageId: string;
  bucketId: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(function onResolve(resolve) {
    setTimeout(resolve, ms);
  });
}

export function setNodeEnvForTest(value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }

  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export async function createDeploymentFixture(): Promise<DeploymentFixture> {
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

export async function cleanupDeploymentFixture(
  fixture: DeploymentFixture,
): Promise<void> {
  await db
    .deleteFrom("domains")
    .where("serviceId", "=", fixture.serviceId)
    .execute();
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

export async function createObjectStorageFixture(input?: {
  region?: string;
}): Promise<ObjectStorageFixture> {
  const fixture = await createDeploymentFixture();
  const suffix = nanoid(8);
  const deploymentId = `dep-object-storage-${suffix}`;
  const objectStorageId = `obj-object-storage-${suffix}`;
  const bucketId = `objb-object-storage-${suffix}`;
  const now = Date.now();

  await db
    .insertInto("deployments")
    .values({
      id: deploymentId,
      serviceId: fixture.serviceId,
      environmentId: fixture.environmentId,
      commitSha: "HEAD",
      status: "running",
      containerId: "container-object-storage",
      hostPort: 19001,
      createdAt: now,
    })
    .execute();
  await db
    .updateTable("services")
    .set({ currentDeploymentId: deploymentId })
    .where("id", "=", fixture.serviceId)
    .execute();
  await db
    .insertInto("objectStorages")
    .values({
      id: objectStorageId,
      projectId: fixture.projectId,
      environmentId: fixture.environmentId,
      name: "files",
      slug: "files",
      runtimeServiceId: fixture.serviceId,
      region: input?.region ?? "garage",
      internalEndpoint: "http://s3-files:3900",
      externalEndpoint: null,
      adminTokenEncrypted: encrypt("admin"),
      metricsTokenEncrypted: encrypt("metrics"),
      createdAt: now,
    })
    .execute();
  await db
    .insertInto("objectStorageBuckets")
    .values({
      id: bucketId,
      objectStorageId,
      garageBucketId: "garage-bucket-files",
      name: "files",
      createdAt: now,
    })
    .execute();

  return { ...fixture, deploymentId, objectStorageId, bucketId };
}

export async function cleanupObjectStorageFixture(
  fixture: ObjectStorageFixture,
): Promise<void> {
  await db
    .deleteFrom("objectStorageAccessKeys")
    .where("objectStorageId", "=", fixture.objectStorageId)
    .execute();
  await db
    .deleteFrom("objectStorageBuckets")
    .where("objectStorageId", "=", fixture.objectStorageId)
    .execute();
  await db
    .deleteFrom("objectStorages")
    .where("id", "=", fixture.objectStorageId)
    .execute();
  await cleanupDeploymentFixture(fixture);
}

export async function cleanupCreatedObjectStorage(
  details: Awaited<ReturnType<typeof createObjectStorage>>,
): Promise<void> {
  const runtimeServiceId = details.objectStorage.runtimeServiceId;

  await db
    .deleteFrom("objectStorageAccessKeys")
    .where("objectStorageId", "=", details.objectStorage.id)
    .execute();
  await db
    .deleteFrom("objectStorageBuckets")
    .where("objectStorageId", "=", details.objectStorage.id)
    .execute();
  await db
    .deleteFrom("objectStorages")
    .where("id", "=", details.objectStorage.id)
    .execute();
  await db
    .updateTable("services")
    .set({ currentDeploymentId: null })
    .where("id", "=", runtimeServiceId)
    .execute();
  await db
    .deleteFrom("deployments")
    .where("serviceId", "=", runtimeServiceId)
    .execute();
  await db.deleteFrom("services").where("id", "=", runtimeServiceId).execute();
}

export async function insertDeployment(
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
