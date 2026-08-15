import { describe, expect, test } from "bun:test";
import type { ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { db } from "./db";
import { runMigrations } from "./migrate";
import {
  buildObjectStorageConnectionSnippets,
  createObjectStorage,
  createObjectStorageS3ObjectDownloadUrl,
  deleteObjectStorageS3Object,
  getGaragePermissions,
  getObjectStorageDetails,
  listObjectStorageBucketObjects,
  listObjectStorageS3Objects,
  normalizeBucketName,
  normalizeObjectStorageName,
  normalizeObjectStorageObjectPrefix,
  normalizeObjectStoragePresignedUrlExpiresInSeconds,
  resetObjectStorageRuntimeForTests,
  setObjectStorageRuntimeForTests,
  waitForObjectStorageDeploymentContainer,
} from "./object-storage";
import {
  cleanupCreatedObjectStorage,
  cleanupDeploymentFixture,
  cleanupObjectStorageFixture,
  createDeploymentFixture,
  createObjectStorageFixture,
  insertDeployment,
  setNodeEnvForTest,
  sleep,
} from "./object-storage-test-helpers";

runMigrations();

describe("object storage naming", () => {
  test("normalizes display names into runtime-safe slugs", () => {
    expect(normalizeObjectStorageName("User Uploads")).toBe("user-uploads");
  });

  test("normalizes bucket names into S3-compatible aliases", () => {
    expect(normalizeBucketName("Avatars")).toBe("avatars");
    expect(normalizeBucketName("a")).toBe("a-s3");
  });
});

describe("createObjectStorage", function describeCreateObjectStorage() {
  test("creates a main bucket when no bucket name is provided", async function testDefaultBucket() {
    const fixture = await createDeploymentFixture();
    const previousNodeEnv = process.env.NODE_ENV;
    const garageCalls: {
      operation: string;
      payload?: Record<string, unknown>;
    }[] = [];
    let createdDetails: Awaited<ReturnType<typeof createObjectStorage>> | null =
      null;

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      deployService: async function deployService(serviceId) {
        const service = await db
          .selectFrom("services")
          .select("environmentId")
          .where("id", "=", serviceId)
          .executeTakeFirst();

        if (!service) {
          throw new Error("Runtime service not found");
        }

        const deploymentId = `dep-object-storage-${nanoid(8)}`;
        await db
          .insertInto("deployments")
          .values({
            id: deploymentId,
            serviceId,
            environmentId: service.environmentId,
            commitSha: "HEAD",
            status: "running",
            containerId: "container-object-storage",
            hostPort: 19002,
            createdAt: Date.now(),
          })
          .execute();
        await db
          .updateTable("services")
          .set({ currentDeploymentId: deploymentId })
          .where("id", "=", serviceId)
          .execute();

        return deploymentId;
      },
      garageJsonApi: async function garageJsonApi(
        _containerId,
        operation,
        payload,
      ) {
        garageCalls.push({ operation, payload });
        if (operation === "CreateBucket") {
          return { id: "garage-main-bucket" };
        }
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-cors-key",
            secretAccessKey: "temporary-cors-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory() {
        return {
          send: async function send() {
            return { $metadata: {} };
          },
        };
      },
    });

    try {
      createdDetails = await createObjectStorage({
        projectId: fixture.projectId,
        environmentId: fixture.environmentId,
        name: "Object Storage",
      });

      expect(createdDetails.buckets[0]?.name).toBe("main");
      expect(garageCalls).toContainEqual({
        operation: "CreateBucket",
        payload: { globalAlias: "main" },
      });
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      if (createdDetails) {
        await cleanupCreatedObjectStorage(createdDetails);
      }
      await cleanupDeploymentFixture(fixture);
    }
  });
});

describe("getObjectStorageDetails", function describeGetObjectStorageDetails() {
  test("uses the verified custom runtime domain as the external endpoint", async function testCustomDomainEndpoint() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const previousNodeEnv = process.env.NODE_ENV;

    setNodeEnvForTest("development");

    try {
      await db
        .insertInto("domains")
        .values([
          {
            id: `dom-object-storage-${nanoid(8)}`,
            serviceId: fixture.serviceId,
            environmentId: fixture.environmentId,
            domain: "s3-system.example.com",
            type: "proxy",
            redirectTarget: null,
            redirectCode: null,
            dnsVerified: true,
            sslStatus: "active",
            isSystem: true,
            createdAt: Date.now(),
          },
          {
            id: `dom-object-storage-${nanoid(8)}`,
            serviceId: fixture.serviceId,
            environmentId: fixture.environmentId,
            domain: "s3.example.com",
            type: "proxy",
            redirectTarget: null,
            redirectCode: null,
            dnsVerified: true,
            sslStatus: "active",
            isSystem: false,
            createdAt: Date.now(),
          },
        ])
        .execute();

      const details = await getObjectStorageDetails(fixture.objectStorageId);

      expect(details.objectStorage.endpoint).toBe("https://s3.example.com");
      expect(details.connection.endpoint).toBe("https://s3.example.com");
    } finally {
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
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

describe("listObjectStorageS3Objects", () => {
  test("normalizes prefixes for list requests", () => {
    expect(normalizeObjectStorageObjectPrefix(" /uploads/avatars ")).toBe(
      "uploads/avatars",
    );
    expect(normalizeObjectStorageObjectPrefix(null)).toBe("");
  });

  test("maps paginated S3 responses into bucket objects", async function testListObjects() {
    const requests: unknown[] = [];
    const pages: ListObjectsV2CommandOutput[] = [
      {
        $metadata: {},
        IsTruncated: true,
        NextContinuationToken: "next-page",
        Contents: [
          {
            Key: "uploads/avatar.png",
            Size: 2048,
            LastModified: new Date("2026-01-02T03:04:05Z"),
            ETag: '"etag-1"',
          },
        ],
      },
      {
        $metadata: {},
        IsTruncated: false,
        Contents: [
          {
            Key: "uploads/profile.json",
            Size: 64,
          },
        ],
      },
    ];
    const client = {
      send: async function send(command: { input: unknown }) {
        requests.push(command.input);
        const page = pages.shift();
        if (!page) {
          throw new Error("Unexpected S3 request");
        }
        return page;
      },
    };

    const firstPage = await listObjectStorageS3Objects({
      client,
      bucket: "assets",
      bucketId: "bucket-assets",
      prefix: "/uploads/",
      maxKeys: 2,
    });
    const secondPage = await listObjectStorageS3Objects({
      client,
      bucket: "assets",
      bucketId: "bucket-assets",
      prefix: "/uploads/",
      cursor: firstPage.nextCursor,
      maxKeys: 2,
    });

    expect(requests).toEqual([
      {
        Bucket: "assets",
        Prefix: "uploads/",
        ContinuationToken: undefined,
        MaxKeys: 2,
      },
      {
        Bucket: "assets",
        Prefix: "uploads/",
        ContinuationToken: "next-page",
        MaxKeys: 2,
      },
    ]);
    expect(firstPage).toEqual({
      bucketId: "bucket-assets",
      prefix: "uploads/",
      nextCursor: "next-page",
      objects: [
        {
          key: "uploads/avatar.png",
          size: 2048,
          lastModified: new Date("2026-01-02T03:04:05Z").getTime(),
          etag: '"etag-1"',
        },
      ],
    });
    expect(secondPage.nextCursor).toBe(null);
    expect(secondPage.objects).toEqual([
      {
        key: "uploads/profile.json",
        size: 64,
        lastModified: null,
        etag: null,
      },
    ]);
  });
});

describe("createObjectStorageS3ObjectDownloadUrl", () => {
  test("normalizes keys and creates an attachment URL", async function testDownloadUrl() {
    const presignRequests: unknown[] = [];
    const client = {
      send: async function send() {
        throw new Error("Unexpected S3 request");
      },
      createPresignedGetUrl: async function createPresignedGetUrl(
        input: unknown,
      ) {
        presignRequests.push(input);
        return "https://s3.example.com/assets/uploads/hello.txt?signature=test";
      },
    };

    const result = await createObjectStorageS3ObjectDownloadUrl({
      client,
      bucket: "assets",
      key: "/uploads/hello.txt",
      expiresInSeconds: 30,
      disposition: "attachment",
    });

    expect(normalizeObjectStoragePresignedUrlExpiresInSeconds(30)).toBe(60);
    expect(result.url).toBe(
      "https://s3.example.com/assets/uploads/hello.txt?signature=test",
    );
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(presignRequests).toEqual([
      {
        bucket: "assets",
        key: "uploads/hello.txt",
        expiresInSeconds: 60,
        responseContentDisposition:
          "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
      },
    ]);
  });
});

describe("deleteObjectStorageS3Object", () => {
  test("normalizes keys and deletes the object", async function testDeleteObject() {
    const requests: unknown[] = [];
    const client = {
      send: async function send(command: { input: unknown }) {
        requests.push(command.input);
        return { $metadata: {} };
      },
    };

    await deleteObjectStorageS3Object({
      client,
      bucket: "assets",
      key: "/uploads/hello.txt",
    });

    expect(requests).toEqual([
      {
        Bucket: "assets",
        Key: "uploads/hello.txt",
      },
    ]);
  });
});

describe("listObjectStorageBucketObjects", () => {
  test("lists objects through a scoped temporary read key", async function testTemporaryReadKey() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const garageCalls: {
      operation: string;
      payload?: Record<string, unknown>;
    }[] = [];
    const clientInputs: unknown[] = [];
    const listRequests: unknown[] = [];

    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(
        _containerId,
        operation,
        payload,
      ) {
        garageCalls.push({ operation, payload });
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-list-key",
            secretAccessKey: "temporary-list-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory(input) {
        clientInputs.push(input);
        return {
          send: async function send(command: { input: unknown }) {
            listRequests.push(command.input);
            return {
              $metadata: {},
              Contents: [{ Key: "uploads/avatar.png", Size: 42 }],
            };
          },
        };
      },
    });

    try {
      const result = await listObjectStorageBucketObjects({
        objectStorageId: fixture.objectStorageId,
        bucketId: fixture.bucketId,
        prefix: "/uploads/",
      });

      expect(result.objects).toEqual([
        {
          key: "uploads/avatar.png",
          size: 42,
          lastModified: null,
          etag: null,
        },
      ]);
      expect(clientInputs).toEqual([
        {
          endpoint: "http://127.0.0.1:19001",
          region: "garage",
          credentials: {
            accessKeyId: "temporary-list-key",
            secretAccessKey: "temporary-list-secret",
          },
        },
      ]);
      expect(listRequests).toEqual([
        {
          Bucket: "files",
          Prefix: "uploads/",
          ContinuationToken: undefined,
          MaxKeys: 100,
        },
      ]);
      expect(garageCalls).toEqual([
        {
          operation: "CreateKey",
          payload: { name: "frost-list-files", neverExpires: true },
        },
        {
          operation: "AllowBucketKey",
          payload: {
            bucketId: "garage-bucket-files",
            accessKeyId: "temporary-list-key",
            permissions: { read: true },
          },
        },
        {
          operation: "DeleteKey",
          payload: { id: "temporary-list-key" },
        },
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      await cleanupObjectStorageFixture(fixture);
    }
  });

  test("cleans temporary read keys when S3 listing fails", async function testTemporaryReadKeyCleanupOnError() {
    const fixture = await createObjectStorageFixture();
    const garageOperations: string[] = [];

    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(_containerId, operation) {
        garageOperations.push(operation);
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-list-key",
            secretAccessKey: "temporary-list-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory() {
        return {
          send: async function send() {
            throw new Error("S3 list failed");
          },
        };
      },
    });

    try {
      await expect(
        listObjectStorageBucketObjects({
          objectStorageId: fixture.objectStorageId,
          bucketId: fixture.bucketId,
        }),
      ).rejects.toThrow("S3 list failed");
      expect(garageOperations).toEqual([
        "CreateKey",
        "AllowBucketKey",
        "DeleteKey",
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      await cleanupObjectStorageFixture(fixture);
    }
  });
});
