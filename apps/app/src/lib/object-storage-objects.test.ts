import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { db } from "./db";
import { runMigrations } from "./migrate";
import {
  createObjectStorageBucketObjectDownloadUrl,
  createObjectStorageBucketObjectUploadUrl,
  createObjectStorageS3ObjectUploadUrl,
  deleteObjectStorageBucketObject,
  resetObjectStorageRuntimeForTests,
  setObjectStorageRuntimeForTests,
} from "./object-storage";
import {
  cleanupObjectStorageFixture,
  createObjectStorageFixture,
  setNodeEnvForTest,
} from "./object-storage-test-helpers";

runMigrations();

describe("createObjectStorageS3ObjectUploadUrl", () => {
  test("normalizes keys and creates a signed upload URL", async function testUploadUrl() {
    const presignRequests: unknown[] = [];
    const client = {
      send: async function send() {
        throw new Error("Unexpected S3 request");
      },
      createPresignedPutUrl: async function createPresignedPutUrl(
        input: unknown,
      ) {
        presignRequests.push(input);
        return "https://s3.example.com/assets/uploads/hello.txt?signature=test";
      },
    };

    const result = await createObjectStorageS3ObjectUploadUrl({
      client,
      bucket: "assets",
      key: "/uploads/hello.txt",
      expiresInSeconds: 30,
      contentType: "text/plain",
    });

    expect(result).toMatchObject({
      url: "https://s3.example.com/assets/uploads/hello.txt?signature=test",
      key: "uploads/hello.txt",
      headers: { "Content-Type": "text/plain" },
    });
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(presignRequests).toEqual([
      {
        bucket: "assets",
        key: "uploads/hello.txt",
        expiresInSeconds: 60,
        contentType: "text/plain",
      },
    ]);
  });
});

describe("createObjectStorageBucketObjectUploadUrl", () => {
  test("creates a signed upload URL and configures CORS through an expiring scoped key", async function testTemporaryUploadUrlKey() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const previousNodeEnv = process.env.NODE_ENV;
    const garageCalls: {
      operation: string;
      payload?: Record<string, unknown>;
    }[] = [];
    const clientInputs: unknown[] = [];
    const corsRequests: unknown[] = [];
    const presignRequests: unknown[] = [];

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(
        _containerId,
        operation,
        payload,
      ) {
        garageCalls.push({ operation, payload });
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-upload-url-key",
            secretAccessKey: "temporary-upload-url-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory(input) {
        clientInputs.push(input);
        return {
          send: async function send(command: { input: unknown }) {
            corsRequests.push(command.input);
            return { $metadata: {} };
          },
          createPresignedPutUrl: async function createPresignedPutUrl(input) {
            presignRequests.push(input);
            return "http://localhost:19001/files/uploads/hello.txt?signature=test";
          },
        };
      },
    });

    try {
      const result = await createObjectStorageBucketObjectUploadUrl({
        objectStorageId: fixture.objectStorageId,
        bucketId: fixture.bucketId,
        key: "/uploads/hello.txt",
        expiresInSeconds: 900,
        contentType: "text/plain",
      });

      expect(result).toMatchObject({
        url: "http://localhost:19001/files/uploads/hello.txt?signature=test",
        key: "uploads/hello.txt",
        headers: { "Content-Type": "text/plain" },
      });
      expect(clientInputs).toEqual([
        {
          endpoint: "http://localhost:19001",
          region: "garage",
          credentials: {
            accessKeyId: "temporary-upload-url-key",
            secretAccessKey: "temporary-upload-url-secret",
          },
        },
      ]);
      expect(corsRequests).toHaveLength(1);
      expect(corsRequests[0]).toMatchObject({
        Bucket: "files",
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "HEAD", "PUT", "DELETE"],
              AllowedOrigins: ["*"],
              ExposeHeaders: ["ETag"],
            },
          ],
        },
      });
      expect(presignRequests).toEqual([
        {
          bucket: "files",
          key: "uploads/hello.txt",
          expiresInSeconds: 900,
          contentType: "text/plain",
        },
      ]);
      expect(garageCalls[0]).toMatchObject({
        operation: "CreateKey",
        payload: { name: "frost-upload-url-files", neverExpires: false },
      });
      expect(garageCalls.slice(1)).toEqual([
        {
          operation: "AllowBucketKey",
          payload: {
            bucketId: "garage-bucket-files",
            accessKeyId: "temporary-upload-url-key",
            permissions: { read: true, write: true, owner: true },
          },
        },
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
  });

  test("cleans temporary upload URL keys when presigning fails", async function testTemporaryUploadUrlCleanupOnError() {
    const fixture = await createObjectStorageFixture();
    const previousNodeEnv = process.env.NODE_ENV;
    const garageOperations: string[] = [];

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(_containerId, operation) {
        garageOperations.push(operation);
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-upload-url-key",
            secretAccessKey: "temporary-upload-url-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory() {
        return {
          send: async function send() {
            return { $metadata: {} };
          },
          createPresignedPutUrl: async function createPresignedPutUrl() {
            throw new Error("S3 presign failed");
          },
        };
      },
    });

    try {
      await expect(
        createObjectStorageBucketObjectUploadUrl({
          objectStorageId: fixture.objectStorageId,
          bucketId: fixture.bucketId,
          key: "uploads/hello.txt",
        }),
      ).rejects.toThrow("S3 presign failed");
      expect(garageOperations).toEqual([
        "CreateKey",
        "AllowBucketKey",
        "DeleteKey",
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
  });
});

describe("createObjectStorageBucketObjectDownloadUrl", () => {
  test("creates a signed URL through an expiring scoped read key", async function testTemporaryUrlKey() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const previousNodeEnv = process.env.NODE_ENV;
    const garageCalls: {
      operation: string;
      payload?: Record<string, unknown>;
    }[] = [];
    const clientInputs: unknown[] = [];
    const presignRequests: unknown[] = [];

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(
        _containerId,
        operation,
        payload,
      ) {
        garageCalls.push({ operation, payload });
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-url-key",
            secretAccessKey: "temporary-url-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory(input) {
        clientInputs.push(input);
        return {
          send: async function send() {
            throw new Error("Unexpected S3 request");
          },
          createPresignedGetUrl: async function createPresignedGetUrl(input) {
            presignRequests.push(input);
            return "http://localhost:19001/files/uploads/hello.txt?signature=test";
          },
        };
      },
    });

    try {
      const result = await createObjectStorageBucketObjectDownloadUrl({
        objectStorageId: fixture.objectStorageId,
        bucketId: fixture.bucketId,
        key: "/uploads/hello.txt",
        expiresInSeconds: 900,
        disposition: "attachment",
      });

      expect(result.url).toBe(
        "http://localhost:19001/files/uploads/hello.txt?signature=test",
      );
      expect(clientInputs).toEqual([
        {
          endpoint: "http://localhost:19001",
          region: "garage",
          credentials: {
            accessKeyId: "temporary-url-key",
            secretAccessKey: "temporary-url-secret",
          },
        },
      ]);
      expect(presignRequests).toEqual([
        {
          bucket: "files",
          key: "uploads/hello.txt",
          expiresInSeconds: 900,
          responseContentDisposition:
            "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
        },
      ]);
      expect(garageCalls[0]).toMatchObject({
        operation: "CreateKey",
        payload: { name: "frost-download-url-files", neverExpires: false },
      });
      expect(garageCalls.slice(1)).toEqual([
        {
          operation: "AllowBucketKey",
          payload: {
            bucketId: "garage-bucket-files",
            accessKeyId: "temporary-url-key",
            permissions: { read: true },
          },
        },
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
  });

  test("signs URLs against the verified custom domain", async function testCustomDomainSignedUrl() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const previousNodeEnv = process.env.NODE_ENV;
    const clientInputs: unknown[] = [];

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(_containerId, operation) {
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-url-key",
            secretAccessKey: "temporary-url-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory(input) {
        clientInputs.push(input);
        return {
          send: async function send() {
            throw new Error("Unexpected S3 request");
          },
          createPresignedGetUrl: async function createPresignedGetUrl() {
            return "https://s3.example.com/files/uploads/hello.txt?signature=test";
          },
        };
      },
    });

    try {
      await db
        .insertInto("domains")
        .values({
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
        })
        .execute();

      const result = await createObjectStorageBucketObjectDownloadUrl({
        objectStorageId: fixture.objectStorageId,
        bucketId: fixture.bucketId,
        key: "uploads/hello.txt",
      });

      expect(result.url).toBe(
        "https://s3.example.com/files/uploads/hello.txt?signature=test",
      );
      expect(clientInputs).toEqual([
        {
          endpoint: "https://s3.example.com",
          region: "garage",
          credentials: {
            accessKeyId: "temporary-url-key",
            secretAccessKey: "temporary-url-secret",
          },
        },
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
  });

  test("cleans temporary URL keys when presigning fails", async function testTemporaryUrlKeyCleanupOnError() {
    const fixture = await createObjectStorageFixture();
    const previousNodeEnv = process.env.NODE_ENV;
    const garageOperations: string[] = [];

    setNodeEnvForTest("development");
    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(_containerId, operation) {
        garageOperations.push(operation);
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-url-key",
            secretAccessKey: "temporary-url-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory() {
        return {
          send: async function send() {
            throw new Error("Unexpected S3 request");
          },
          createPresignedGetUrl: async function createPresignedGetUrl() {
            throw new Error("S3 presign failed");
          },
        };
      },
    });

    try {
      await expect(
        createObjectStorageBucketObjectDownloadUrl({
          objectStorageId: fixture.objectStorageId,
          bucketId: fixture.bucketId,
          key: "uploads/hello.txt",
        }),
      ).rejects.toThrow("S3 presign failed");
      expect(garageOperations).toEqual([
        "CreateKey",
        "AllowBucketKey",
        "DeleteKey",
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      setNodeEnvForTest(previousNodeEnv);
      await cleanupObjectStorageFixture(fixture);
    }
  });
});

describe("deleteObjectStorageBucketObject", () => {
  test("deletes through a scoped temporary write key", async function testTemporaryDeleteKey() {
    const fixture = await createObjectStorageFixture({ region: "garage" });
    const garageCalls: {
      operation: string;
      payload?: Record<string, unknown>;
    }[] = [];
    const clientInputs: unknown[] = [];
    const deleteRequests: unknown[] = [];

    setObjectStorageRuntimeForTests({
      garageJsonApi: async function garageJsonApi(
        _containerId,
        operation,
        payload,
      ) {
        garageCalls.push({ operation, payload });
        if (operation === "CreateKey") {
          return {
            accessKeyId: "temporary-delete-key",
            secretAccessKey: "temporary-delete-secret",
          };
        }
        return null;
      },
      s3ClientFactory: function s3ClientFactory(input) {
        clientInputs.push(input);
        return {
          send: async function send(command: { input: unknown }) {
            deleteRequests.push(command.input);
            return { $metadata: {} };
          },
        };
      },
    });

    try {
      await deleteObjectStorageBucketObject({
        objectStorageId: fixture.objectStorageId,
        bucketId: fixture.bucketId,
        key: "/uploads/hello.txt",
      });

      expect(clientInputs).toEqual([
        {
          endpoint: "http://127.0.0.1:19001",
          region: "garage",
          credentials: {
            accessKeyId: "temporary-delete-key",
            secretAccessKey: "temporary-delete-secret",
          },
        },
      ]);
      expect(deleteRequests).toEqual([
        {
          Bucket: "files",
          Key: "uploads/hello.txt",
        },
      ]);
      expect(garageCalls).toEqual([
        {
          operation: "CreateKey",
          payload: { name: "frost-delete-files", neverExpires: true },
        },
        {
          operation: "AllowBucketKey",
          payload: {
            bucketId: "garage-bucket-files",
            accessKeyId: "temporary-delete-key",
            permissions: { read: true, write: true },
          },
        },
        {
          operation: "DeleteKey",
          payload: { id: "temporary-delete-key" },
        },
      ]);
    } finally {
      resetObjectStorageRuntimeForTests();
      await cleanupObjectStorageFixture(fixture);
    }
  });
});
