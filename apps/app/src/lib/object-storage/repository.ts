import type { Selectable } from "kysely";
import { encrypt } from "../crypto";
import { db } from "../db";
import type { ObjectStorageBuckets, ObjectStorages } from "../db-types";
import { syncCaddyConfig } from "../domains";
import {
  newObjectStorageAccessKeyId,
  newObjectStorageBucketId,
  newObjectStorageId,
} from "../id";
import {
  DEFAULT_OBJECT_STORAGE_BUCKET_NAME,
  GARAGE_REGION,
  getObjectStorageSigningRegion,
} from "./config";
import {
  getErrorMessage,
  objectStorageConflict,
  objectStorageNotFound,
  objectStorageValidation,
} from "./errors";
import {
  allowGarageKey,
  createGarageBucket,
  createGarageKey,
  deleteGarageBucket,
  deleteGarageKey,
  waitForGarageReady,
} from "./garage-admin";
import { normalizeBucketName, normalizeObjectStorageName } from "./naming";
import { createObjectBrowserReadSession } from "./object-browser";
import {
  attachObjectStorageRuntime,
  cleanupObjectStorageRuntimeService,
  createObjectStorageRuntimeSecrets,
  createObjectStorageRuntimeService,
  deployObjectStorageRuntimeService,
  getLatestRuntimeDeployment,
  getObjectStorageConnectionInfo,
  getObjectStorageServerIp,
  getRunningObjectStorageRuntime,
  getRuntimeContainerId,
  getRuntimeLocalS3Endpoint,
  waitForObjectStorageDeploymentContainer,
} from "./runtime";
import { createObjectStorageS3Client, listObjectStorageS3Objects } from "./s3";
import { buildObjectStorageConnectionSnippets } from "./snippets";
import type {
  CreateAccessKeyInput,
  CreateAccessKeyResult,
  CreateBucketInput,
  CreateObjectStorageInput,
  ListBucketObjectsInput,
  ObjectStorageBucketObjectList,
  ObjectStorageDeployment,
  ObjectStorageDetails,
  ObjectStorageWithRuntime,
} from "./types";

type ObjectStorageBucketWithGarageId = Selectable<ObjectStorageBuckets> & {
  garageBucketId: string;
};

async function getObjectStorageRow(
  objectStorageId: string,
): Promise<Selectable<ObjectStorages>> {
  const objectStorage = await db
    .selectFrom("objectStorages")
    .selectAll()
    .where("id", "=", objectStorageId)
    .executeTakeFirst();

  if (!objectStorage) {
    throw objectStorageNotFound("Object storage not found");
  }

  return objectStorage;
}

async function getObjectStorageBucketWithGarageId(input: {
  objectStorageId: string;
  bucketId: string;
}): Promise<ObjectStorageBucketWithGarageId> {
  const bucket = await db
    .selectFrom("objectStorageBuckets")
    .selectAll()
    .where("id", "=", input.bucketId)
    .where("objectStorageId", "=", input.objectStorageId)
    .executeTakeFirst();

  if (!bucket) {
    throw objectStorageNotFound("Bucket not found");
  }
  if (!bucket.garageBucketId) {
    throw objectStorageValidation("Bucket is missing its Garage id");
  }

  return { ...bucket, garageBucketId: bucket.garageBucketId };
}

function getAccessKeyPrefix(accessKeyId: string): string {
  const [prefix] = accessKeyId.split(".");
  return prefix && prefix.length > 0 ? prefix : accessKeyId.slice(0, 16);
}

async function rollbackObjectStorageProvisioning(input: {
  objectStorageId: string;
  runtimeServiceId: string;
}): Promise<void> {
  await db
    .deleteFrom("objectStorageAccessKeys")
    .where("objectStorageId", "=", input.objectStorageId)
    .execute();
  await db
    .deleteFrom("objectStorageBuckets")
    .where("objectStorageId", "=", input.objectStorageId)
    .execute();
  await db
    .deleteFrom("objectStorages")
    .where("id", "=", input.objectStorageId)
    .execute();
  await cleanupObjectStorageRuntimeService(input.runtimeServiceId);
}

export async function listObjectStoragesByProject(
  projectId: string,
): Promise<ObjectStorageWithRuntime[]> {
  const rows = await db
    .selectFrom("objectStorages")
    .selectAll()
    .where("projectId", "=", projectId)
    .orderBy("createdAt", "asc")
    .execute();

  const serverIp = await getObjectStorageServerIp();
  return Promise.all(
    rows.map(function attachRuntime(row) {
      return attachObjectStorageRuntime(row, { serverIp });
    }),
  );
}

export async function getObjectStorageDetails(
  objectStorageId: string,
): Promise<ObjectStorageDetails> {
  const objectStorage = await getObjectStorageRow(objectStorageId);
  const serverIp = await getObjectStorageServerIp();
  const [runtimeStorage, buckets, accessKeys] = await Promise.all([
    attachObjectStorageRuntime(objectStorage, { serverIp }),
    db
      .selectFrom("objectStorageBuckets")
      .selectAll()
      .where("objectStorageId", "=", objectStorageId)
      .orderBy("createdAt", "asc")
      .execute(),
    db
      .selectFrom("objectStorageAccessKeys")
      .selectAll()
      .where("objectStorageId", "=", objectStorageId)
      .orderBy("createdAt", "asc")
      .execute(),
  ]);

  return {
    objectStorage: runtimeStorage,
    buckets,
    accessKeys,
    connection: getObjectStorageConnectionInfo(runtimeStorage),
  };
}

export async function createObjectStorage(
  input: CreateObjectStorageInput,
): Promise<ObjectStorageDetails> {
  const project = await db
    .selectFrom("projects")
    .select(["id", "name", "hostname"])
    .where("id", "=", input.projectId)
    .executeTakeFirst();

  if (!project) {
    throw objectStorageNotFound("Project not found");
  }

  const environment = await db
    .selectFrom("environments")
    .select(["id", "projectId", "name", "type"])
    .where("id", "=", input.environmentId)
    .where("projectId", "=", input.projectId)
    .executeTakeFirst();

  if (!environment) {
    throw objectStorageNotFound("Environment not found");
  }

  const slug = normalizeObjectStorageName(input.name);
  const existing = await db
    .selectFrom("objectStorages")
    .select("id")
    .where("environmentId", "=", input.environmentId)
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (existing) {
    throw objectStorageConflict("Object storage with this name already exists");
  }

  const objectStorageId = newObjectStorageId();
  const secrets = createObjectStorageRuntimeSecrets();
  const runtime = await createObjectStorageRuntimeService({
    environmentId: input.environmentId,
    projectName: project.name,
    projectHostname: project.hostname,
    environmentName: environment.name,
    environmentType: environment.type,
    slug,
    secrets,
  });

  try {
    await db
      .insertInto("objectStorages")
      .values({
        id: objectStorageId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.name,
        slug,
        engine: "garage",
        runtimeServiceId: runtime.service.id,
        region: GARAGE_REGION,
        internalEndpoint: runtime.internalEndpoint,
        externalEndpoint: runtime.externalEndpoint,
        adminTokenEncrypted: encrypt(secrets.adminToken),
        metricsTokenEncrypted: encrypt(secrets.metricsToken),
        createdAt: Date.now(),
      })
      .execute();

    const deploymentId = await deployObjectStorageRuntimeService(
      runtime.service.id,
    );
    const containerId =
      await waitForObjectStorageDeploymentContainer(deploymentId);

    await waitForGarageReady(containerId);
    const bucketName = normalizeBucketName(
      input.bucketName ?? DEFAULT_OBJECT_STORAGE_BUCKET_NAME,
    );
    const bucketInfo = await createGarageBucket(containerId, bucketName);

    await db
      .insertInto("objectStorageBuckets")
      .values({
        id: newObjectStorageBucketId(),
        objectStorageId,
        garageBucketId: bucketInfo.id,
        name: bucketName,
        createdAt: Date.now(),
      })
      .execute();

    return getObjectStorageDetails(objectStorageId);
  } catch (error) {
    await rollbackObjectStorageProvisioning({
      objectStorageId,
      runtimeServiceId: runtime.service.id,
    });
    throw error;
  }
}

export async function createObjectStorageBucket(
  input: CreateBucketInput,
): Promise<Selectable<ObjectStorageBuckets>> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const name = normalizeBucketName(input.name);
  const existing = await db
    .selectFrom("objectStorageBuckets")
    .select("id")
    .where("objectStorageId", "=", input.objectStorageId)
    .where("name", "=", name)
    .executeTakeFirst();

  if (existing) {
    throw objectStorageConflict("Bucket with this name already exists");
  }

  const containerId = await getRuntimeContainerId(objectStorage);
  const bucketInfo = await createGarageBucket(containerId, name);
  const id = newObjectStorageBucketId();

  await db
    .insertInto("objectStorageBuckets")
    .values({
      id,
      objectStorageId: input.objectStorageId,
      garageBucketId: bucketInfo.id,
      name,
      createdAt: Date.now(),
    })
    .execute();

  const bucket = await db
    .selectFrom("objectStorageBuckets")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!bucket) {
    throw new Error("Failed to create bucket");
  }

  return bucket;
}

export async function deleteObjectStorageBucket(input: {
  objectStorageId: string;
  bucketId: string;
}): Promise<void> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const bucket = await getObjectStorageBucketWithGarageId(input);

  const containerId = await getRuntimeContainerId(objectStorage);
  try {
    await deleteGarageBucket(containerId, bucket.garageBucketId);
  } catch (error) {
    throw objectStorageValidation(getErrorMessage(error));
  }
  await db
    .deleteFrom("objectStorageBuckets")
    .where("id", "=", bucket.id)
    .execute();
}

export async function createObjectStorageAccessKey(
  input: CreateAccessKeyInput,
): Promise<CreateAccessKeyResult> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const bucket = await getObjectStorageBucketWithGarageId(input);

  const containerId = await getRuntimeContainerId(objectStorage);
  const garageKey = await createGarageKey(containerId, input.name);

  if (!garageKey.secretAccessKey) {
    await deleteGarageKey(containerId, garageKey.accessKeyId).catch(
      function ignoreCleanupError() {},
    );
    throw new Error("Garage did not return the secret access key");
  }

  try {
    await allowGarageKey({
      containerId,
      bucketId: bucket.garageBucketId,
      accessKeyId: garageKey.accessKeyId,
      permissions: input.permissions,
    });
  } catch (error) {
    await deleteGarageKey(containerId, garageKey.accessKeyId).catch(
      function ignoreCleanupError() {},
    );
    throw error;
  }

  const id = newObjectStorageAccessKeyId();
  await db
    .insertInto("objectStorageAccessKeys")
    .values({
      id,
      objectStorageId: input.objectStorageId,
      bucketId: bucket.id,
      accessKeyId: garageKey.accessKeyId,
      name: input.name,
      keyPrefix: getAccessKeyPrefix(garageKey.accessKeyId),
      permissions: input.permissions,
      secretAccessKeyEncrypted: encrypt(garageKey.secretAccessKey),
      createdAt: Date.now(),
      revokedAt: null,
    })
    .execute();

  const accessKey = await db
    .selectFrom("objectStorageAccessKeys")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!accessKey) {
    throw new Error("Failed to create access key");
  }

  const serverIp = await getObjectStorageServerIp();
  const runtimeStorage = await attachObjectStorageRuntime(objectStorage, {
    serverIp,
  });

  return {
    accessKey,
    secretAccessKey: garageKey.secretAccessKey,
    snippets: buildObjectStorageConnectionSnippets({
      endpoint: runtimeStorage.endpoint,
      internalEndpoint: objectStorage.internalEndpoint,
      region: runtimeStorage.region,
      bucket: bucket.name,
      accessKeyId: garageKey.accessKeyId,
      secretAccessKey: garageKey.secretAccessKey,
    }),
  };
}

export async function listObjectStorageBucketObjects(
  input: ListBucketObjectsInput,
): Promise<ObjectStorageBucketObjectList> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const bucket = await getObjectStorageBucketWithGarageId(input);
  const runtime = await getRunningObjectStorageRuntime(objectStorage);
  const browserSession = await createObjectBrowserReadSession({
    containerId: runtime.containerId,
    bucketName: bucket.name,
    garageBucketId: bucket.garageBucketId,
  });

  try {
    const client = createObjectStorageS3Client({
      endpoint: getRuntimeLocalS3Endpoint(runtime.hostPort),
      region: getObjectStorageSigningRegion(objectStorage.region),
      credentials: browserSession.credentials,
    });

    return await listObjectStorageS3Objects({
      client,
      bucket: bucket.name,
      bucketId: bucket.id,
      prefix: input.prefix ?? "",
      cursor: input.cursor,
    });
  } catch (error) {
    throw objectStorageValidation(getErrorMessage(error));
  } finally {
    await browserSession.cleanup();
  }
}

export async function revokeObjectStorageAccessKey(input: {
  objectStorageId: string;
  accessKeyId: string;
}): Promise<void> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const accessKey = await db
    .selectFrom("objectStorageAccessKeys")
    .selectAll()
    .where("id", "=", input.accessKeyId)
    .where("objectStorageId", "=", input.objectStorageId)
    .executeTakeFirst();

  if (!accessKey) {
    throw objectStorageNotFound("Access key not found");
  }

  if (!accessKey.revokedAt) {
    const containerId = await getRuntimeContainerId(objectStorage);
    await deleteGarageKey(containerId, accessKey.accessKeyId);
  }

  await db
    .updateTable("objectStorageAccessKeys")
    .set({ revokedAt: Date.now() })
    .where("id", "=", accessKey.id)
    .execute();
}

export async function deleteObjectStorage(
  objectStorageId: string,
): Promise<void> {
  const objectStorage = await getObjectStorageRow(objectStorageId);
  await cleanupObjectStorageRuntimeService(objectStorage.runtimeServiceId);

  try {
    await syncCaddyConfig();
  } catch {}
}

export async function getObjectStorageLatestDeployment(
  objectStorageId: string,
): Promise<ObjectStorageDeployment | null> {
  const objectStorage = await getObjectStorageRow(objectStorageId);
  return getLatestRuntimeDeployment(objectStorage.runtimeServiceId);
}
