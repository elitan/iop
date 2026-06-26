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
  ObjectStorageError,
  objectStorageConflict,
  objectStorageNotFound,
  objectStorageNotReady,
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
import { createObjectBrowserSession } from "./object-browser";
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
  resolveObjectStoragePublicEndpoint,
  waitForObjectStorageDeploymentContainer,
} from "./runtime";
import {
  configureObjectStorageS3BucketCors,
  createObjectStorageS3Client,
  createObjectStorageS3ObjectDownloadUrl,
  createObjectStorageS3ObjectUploadUrl,
  deleteObjectStorageS3Object,
  listObjectStorageS3Objects,
  normalizeObjectStorageObjectKey,
  normalizeObjectStoragePresignedUrlExpiresInSeconds,
} from "./s3";
import { buildObjectStorageConnectionSnippets } from "./snippets";
import type {
  CreateAccessKeyInput,
  CreateAccessKeyResult,
  CreateBucketInput,
  CreateBucketObjectDownloadUrlInput,
  CreateBucketObjectDownloadUrlResult,
  CreateBucketObjectUploadUrlInput,
  CreateBucketObjectUploadUrlResult,
  CreateObjectStorageInput,
  DeleteBucketObjectInput,
  ListBucketObjectsInput,
  ObjectStorageBucketObjectList,
  ObjectStorageDeployment,
  ObjectStorageDetails,
  ObjectStorageWithRuntime,
} from "./types";

type ObjectStorageBucketWithGarageId = Selectable<ObjectStorageBuckets> & {
  garageBucketId: string;
};

type BucketClientEndpoint = "local" | "public";

interface BucketClientContext {
  objectStorage: Selectable<ObjectStorages>;
  bucket: ObjectStorageBucketWithGarageId;
  client: ReturnType<typeof createObjectStorageS3Client>;
}

interface BucketClientInput {
  objectStorageId: string;
  bucketId: string;
  endpoint: BucketClientEndpoint;
  permissions: CreateAccessKeyInput["permissions"];
  sessionName: string;
  keyExpiration?: Date;
  cleanupOnSuccess?: boolean;
}

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

function assertObjectKey(key: string): string {
  const normalizedKey = normalizeObjectStorageObjectKey(key);

  if (normalizedKey.length === 0) {
    throw objectStorageValidation("Object key is required");
  }

  return normalizedKey;
}

function getPresignedUrlExpiration(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

async function resolveBucketClientEndpoint(input: {
  endpoint: BucketClientEndpoint;
  objectStorage: Selectable<ObjectStorages>;
  hostPort: number;
}): Promise<string | null> {
  if (input.endpoint === "local") {
    return getRuntimeLocalS3Endpoint(input.hostPort);
  }

  return resolveObjectStoragePublicEndpoint({
    runtimeServiceId: input.objectStorage.runtimeServiceId,
    externalEndpoint: input.objectStorage.externalEndpoint,
    serverIp: await getObjectStorageServerIp(),
    hostPort: input.hostPort,
  });
}

async function withObjectStorageBucketClient<T>(
  input: BucketClientInput,
  action: (context: BucketClientContext) => Promise<T>,
): Promise<T> {
  const objectStorage = await getObjectStorageRow(input.objectStorageId);
  const bucket = await getObjectStorageBucketWithGarageId(input);
  const runtime = await getRunningObjectStorageRuntime(objectStorage);
  const browserSession = await createObjectBrowserSession({
    containerId: runtime.containerId,
    bucketName: bucket.name,
    garageBucketId: bucket.garageBucketId,
    permissions: input.permissions,
    namePrefix: input.sessionName,
    keyExpiration: input.keyExpiration,
  });
  let succeeded = false;

  try {
    const endpoint = await resolveBucketClientEndpoint({
      endpoint: input.endpoint,
      objectStorage,
      hostPort: runtime.hostPort,
    });

    if (!endpoint) {
      throw objectStorageNotReady("Object storage endpoint is not ready");
    }

    const result = await action({
      objectStorage,
      bucket,
      client: createObjectStorageS3Client({
        endpoint,
        region: getObjectStorageSigningRegion(objectStorage.region),
        credentials: browserSession.credentials,
      }),
    });
    succeeded = true;
    return result;
  } catch (error) {
    if (error instanceof ObjectStorageError) {
      throw error;
    }
    throw objectStorageValidation(getErrorMessage(error));
  } finally {
    if (!succeeded || input.cleanupOnSuccess !== false) {
      await browserSession.cleanup();
    }
  }
}

async function configureObjectStorageBucketCors(input: {
  objectStorageId: string;
  bucketId: string;
}): Promise<void> {
  await withObjectStorageBucketClient(
    {
      objectStorageId: input.objectStorageId,
      bucketId: input.bucketId,
      endpoint: "local",
      permissions: "full",
      sessionName: "cors",
    },
    function configureCors({ bucket, client }) {
      return configureObjectStorageS3BucketCors({
        client,
        bucket: bucket.name,
      });
    },
  );
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
    const bucketId = newObjectStorageBucketId();

    await db
      .insertInto("objectStorageBuckets")
      .values({
        id: bucketId,
        objectStorageId,
        garageBucketId: bucketInfo.id,
        name: bucketName,
        createdAt: Date.now(),
      })
      .execute();
    await configureObjectStorageBucketCors({ objectStorageId, bucketId });

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
  try {
    await configureObjectStorageBucketCors({
      objectStorageId: input.objectStorageId,
      bucketId: id,
    });
  } catch (error) {
    await db.deleteFrom("objectStorageBuckets").where("id", "=", id).execute();
    await deleteGarageBucket(containerId, bucketInfo.id).catch(
      function ignoreBucketCleanupError() {},
    );
    throw error;
  }

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
  return withObjectStorageBucketClient(
    {
      objectStorageId: input.objectStorageId,
      bucketId: input.bucketId,
      endpoint: "local",
      permissions: "read-only",
      sessionName: "list",
    },
    function listObjects({ bucket, client }) {
      return listObjectStorageS3Objects({
        client,
        bucket: bucket.name,
        bucketId: bucket.id,
        prefix: input.prefix ?? "",
        cursor: input.cursor,
      });
    },
  );
}

export async function createObjectStorageBucketObjectUploadUrl(
  input: CreateBucketObjectUploadUrlInput,
): Promise<CreateBucketObjectUploadUrlResult> {
  const key = assertObjectKey(input.key);
  const expiresInSeconds = normalizeObjectStoragePresignedUrlExpiresInSeconds(
    input.expiresInSeconds,
  );

  return withObjectStorageBucketClient(
    {
      objectStorageId: input.objectStorageId,
      bucketId: input.bucketId,
      endpoint: "public",
      permissions: "full",
      sessionName: "upload-url",
      keyExpiration: getPresignedUrlExpiration(expiresInSeconds),
      cleanupOnSuccess: false,
    },
    async function createUploadUrl({ bucket, client }) {
      await configureObjectStorageS3BucketCors({
        client,
        bucket: bucket.name,
      });
      return createObjectStorageS3ObjectUploadUrl({
        client,
        bucket: bucket.name,
        key,
        expiresInSeconds,
        contentType: input.contentType,
      });
    },
  );
}

export async function createObjectStorageBucketObjectDownloadUrl(
  input: CreateBucketObjectDownloadUrlInput,
): Promise<CreateBucketObjectDownloadUrlResult> {
  const key = assertObjectKey(input.key);
  const expiresInSeconds = normalizeObjectStoragePresignedUrlExpiresInSeconds(
    input.expiresInSeconds,
  );

  return withObjectStorageBucketClient(
    {
      objectStorageId: input.objectStorageId,
      bucketId: input.bucketId,
      endpoint: "public",
      permissions: "read-only",
      sessionName: "download-url",
      keyExpiration: getPresignedUrlExpiration(expiresInSeconds),
      cleanupOnSuccess: false,
    },
    function createDownloadUrl({ bucket, client }) {
      return createObjectStorageS3ObjectDownloadUrl({
        client,
        bucket: bucket.name,
        key,
        expiresInSeconds,
        disposition: input.disposition,
      });
    },
  );
}

export async function deleteObjectStorageBucketObject(
  input: DeleteBucketObjectInput,
): Promise<void> {
  const key = assertObjectKey(input.key);

  await withObjectStorageBucketClient(
    {
      objectStorageId: input.objectStorageId,
      bucketId: input.bucketId,
      endpoint: "local",
      permissions: "read-write",
      sessionName: "delete",
    },
    function deleteObject({ bucket, client }) {
      return deleteObjectStorageS3Object({
        client,
        bucket: bucket.name,
        key,
      });
    },
  );
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
