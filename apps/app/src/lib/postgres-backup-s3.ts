import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export type PostgresBackupS3Provider =
  | "aws"
  | "cloudflare"
  | "backblaze"
  | "custom";

export interface PostgresBackupS3Config {
  provider: PostgresBackupS3Provider;
  endpoint: string | null;
  region: string | null;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface PostgresBackupS3Object {
  key: string;
  size: number;
  lastModified: number | null;
}

function getDefaultRegion(provider: PostgresBackupS3Provider): string {
  if (provider === "cloudflare") {
    return "auto";
  }

  return "us-east-1";
}

export function normalizeS3Prefix(prefix: string): string {
  return prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function joinS3Key(...parts: string[]): string {
  return parts
    .map(function mapPart(part) {
      return part.trim();
    })
    .filter(function hasValue(part) {
      return part.length > 0;
    })
    .join("/")
    .replace(/\/+/g, "/");
}

export function createPostgresBackupS3Client(
  config: PostgresBackupS3Config,
): S3Client {
  const clientConfig: S3ClientConfig = {
    region:
      config.region && config.region.trim().length > 0
        ? config.region
        : getDefaultRegion(config.provider),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  };

  if (config.endpoint && config.endpoint.trim().length > 0) {
    clientConfig.endpoint = config.endpoint;
  }

  return new S3Client(clientConfig);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const stream = body as Readable;
  return new Promise(function waitForStream(resolve, reject) {
    const chunks: Buffer[] = [];
    stream.on("data", function onData(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", function onEnd() {
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function putFileToS3(input: {
  client: S3Client;
  bucket: string;
  key: string;
  filePath: string;
  contentType?: string;
}): Promise<void> {
  await input.client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: createReadStream(input.filePath),
      ContentType: input.contentType,
    }),
  );
}

export async function putTextToS3(input: {
  client: S3Client;
  bucket: string;
  key: string;
  text: string;
  contentType?: string;
}): Promise<void> {
  await input.client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.text,
      ContentType: input.contentType,
    }),
  );
}

export async function getTextFromS3(input: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<string> {
  const output = await input.client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
  const buffer = await streamToBuffer(output.Body);
  return buffer.toString("utf8");
}

export async function getBufferFromS3(input: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<Buffer> {
  const output = await input.client.send(
    new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
  return streamToBuffer(output.Body);
}

export async function listS3Objects(input: {
  client: S3Client;
  bucket: string;
  prefix: string;
}): Promise<PostgresBackupS3Object[]> {
  let continuationToken: string | undefined;
  const objects: PostgresBackupS3Object[] = [];

  do {
    const output = await input.client.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of output.Contents ?? []) {
      if (!item.Key) {
        continue;
      }
      objects.push({
        key: item.Key,
        size: item.Size ?? 0,
        lastModified: item.LastModified ? item.LastModified.getTime() : null,
      });
    }

    continuationToken = output.IsTruncated
      ? output.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

export async function deleteS3Objects(input: {
  client: S3Client;
  bucket: string;
  keys: string[];
}): Promise<void> {
  if (input.keys.length === 0) {
    return;
  }

  const batches: string[][] = [];
  for (let i = 0; i < input.keys.length; i += 1000) {
    batches.push(input.keys.slice(i, i + 1000));
  }

  for (const keys of batches) {
    await input.client.send(
      new DeleteObjectsCommand({
        Bucket: input.bucket,
        Delete: {
          Objects: keys.map(function toObject(key) {
            return { Key: key };
          }),
          Quiet: true,
        },
      }),
    );
  }
}

export async function deleteS3Object(input: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<void> {
  await input.client.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
}

export async function testS3Connection(input: {
  client: S3Client;
  bucket: string;
  prefix: string;
}): Promise<void> {
  const prefix = normalizeS3Prefix(input.prefix);
  const probeKey = joinS3Key(prefix, ".frost-probe", `${randomUUID()}.txt`);
  const probeBody = `frost-probe-${Date.now()}`;

  await putTextToS3({
    client: input.client,
    bucket: input.bucket,
    key: probeKey,
    text: probeBody,
    contentType: "text/plain",
  });

  const loaded = await getTextFromS3({
    client: input.client,
    bucket: input.bucket,
    key: probeKey,
  });

  if (loaded !== probeBody) {
    throw new Error("S3 probe content mismatch");
  }

  await deleteS3Object({
    client: input.client,
    bucket: input.bucket,
    key: probeKey,
  });
}
