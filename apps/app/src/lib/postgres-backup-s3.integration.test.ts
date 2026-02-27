import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CreateBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  createPostgresBackupS3Client,
  deleteS3Object,
  getTextFromS3,
  joinS3Key,
  listS3Objects,
  putTextToS3,
  testS3Connection,
} from "./postgres-backup-s3";

const execAsync = promisify(exec);

const MINIO_CONTAINER = "frost-test-postgres-backup-minio";
const MINIO_PORT = 19995;
const MINIO_ENDPOINT = `http://127.0.0.1:${MINIO_PORT}`;
const MINIO_ACCESS_KEY = "minioadmin";
const MINIO_SECRET_KEY = "minioadmin";
const MINIO_BUCKET = "frost-test-backups";

async function startMinio(): Promise<void> {
  await execAsync(`docker rm -f ${MINIO_CONTAINER}`).catch(
    function ignore() {},
  );
  await execAsync(
    `docker run -d --name ${MINIO_CONTAINER} -p ${MINIO_PORT}:9000 ` +
      `-e MINIO_ROOT_USER=${MINIO_ACCESS_KEY} -e MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY} ` +
      `minio/minio:latest server /data`,
  );
}

async function waitForMinioReady(client: S3Client): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: MINIO_BUCKET,
        }),
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("BucketAlreadyOwnedByYou")) {
        return;
      }
      await new Promise(function wait(resolve) {
        setTimeout(resolve, 1000);
      });
    }
  }

  throw new Error("MinIO did not become ready");
}

describe("postgres backup s3 integration", () => {
  const client = createPostgresBackupS3Client({
    provider: "custom",
    endpoint: MINIO_ENDPOINT,
    region: "us-east-1",
    bucket: MINIO_BUCKET,
    prefix: "frost-tests",
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
    forcePathStyle: true,
  });

  beforeAll(async () => {
    await startMinio();
    await waitForMinioReady(client);
  }, 120000);

  afterAll(async () => {
    await execAsync(`docker rm -f ${MINIO_CONTAINER}`).catch(
      function ignore() {},
    );
  });

  test("put/get/list/delete object", async () => {
    const key = joinS3Key("frost-tests", "sample", "value.txt");
    await putTextToS3({
      client,
      bucket: MINIO_BUCKET,
      key,
      text: "hello",
      contentType: "text/plain",
    });

    const loaded = await getTextFromS3({
      client,
      bucket: MINIO_BUCKET,
      key,
    });
    expect(loaded).toBe("hello");

    const objects = await listS3Objects({
      client,
      bucket: MINIO_BUCKET,
      prefix: "frost-tests/sample",
    });
    expect(
      objects.some(function hasKey(item) {
        return item.key === key;
      }),
    ).toBe(true);

    await deleteS3Object({
      client,
      bucket: MINIO_BUCKET,
      key,
    });
  });

  test("testS3Connection probe succeeds", async () => {
    await testS3Connection({
      client,
      bucket: MINIO_BUCKET,
      prefix: "frost-tests/probe",
    });
  });
});
