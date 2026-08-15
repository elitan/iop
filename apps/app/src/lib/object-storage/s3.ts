import {
  DeleteObjectCommand,
  type DeleteObjectCommandOutput,
  GetObjectCommand,
  type GetObjectCommandInput,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutBucketCorsCommand,
  type PutBucketCorsCommandOutput,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStorageBucketObjectList,
  ObjectStorageObjectDownloadDisposition,
} from "./types";

const DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;
const MIN_PRESIGNED_URL_EXPIRES_IN_SECONDS = 60;
const MAX_PRESIGNED_URL_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

export interface ObjectStorageS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ObjectStorageS3ClientInput {
  endpoint: string;
  region: string;
  credentials: ObjectStorageS3Credentials;
}

type ObjectStorageS3Command =
  | DeleteObjectCommand
  | ListObjectsV2Command
  | PutBucketCorsCommand;
type ObjectStorageS3CommandOutput =
  | ListObjectsV2CommandOutput
  | DeleteObjectCommandOutput
  | PutBucketCorsCommandOutput;

interface ObjectStoragePresignedGetUrlInput {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  responseContentDisposition?: string;
}

interface ObjectStoragePresignedPutUrlInput {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  contentType?: string | null;
}

export interface ObjectStorageS3Client {
  send(command: ObjectStorageS3Command): Promise<ObjectStorageS3CommandOutput>;
  createPresignedGetUrl?(
    input: ObjectStoragePresignedGetUrlInput,
  ): Promise<string>;
  createPresignedPutUrl?(
    input: ObjectStoragePresignedPutUrlInput,
  ): Promise<string>;
}

export type ObjectStorageS3ClientFactory = (
  input: ObjectStorageS3ClientInput,
) => ObjectStorageS3Client;

let objectStorageS3ClientFactory: ObjectStorageS3ClientFactory =
  createAwsObjectStorageS3Client;

export function normalizeObjectStorageObjectPrefix(
  prefix: string | null | undefined,
): string {
  return (prefix ?? "").trim().replace(/^\/+/, "");
}

export function normalizeObjectStorageObjectKey(key: string): string {
  return key.trim().replace(/^\/+/, "");
}

export function normalizeObjectStoragePresignedUrlExpiresInSeconds(
  expiresInSeconds: number | null | undefined,
): number {
  const value = expiresInSeconds ?? DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS;

  if (!Number.isFinite(value)) {
    return DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS;
  }

  return Math.min(
    Math.max(Math.floor(value), MIN_PRESIGNED_URL_EXPIRES_IN_SECONDS),
    MAX_PRESIGNED_URL_EXPIRES_IN_SECONDS,
  );
}

function getObjectStorageDownloadFileName(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1);
  return (fileName && fileName.length > 0 ? fileName : "download").replace(
    /["\\]/g,
    "_",
  );
}

function getObjectStorageContentDisposition(
  disposition: ObjectStorageObjectDownloadDisposition,
  key: string,
): string {
  const fileName = getObjectStorageDownloadFileName(key);
  return `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
}

function createAwsObjectStorageS3Client(
  input: ObjectStorageS3ClientInput,
): ObjectStorageS3Client {
  const clientConfig: S3ClientConfig = {
    endpoint: input.endpoint,
    region: input.region,
    credentials: input.credentials,
    forcePathStyle: true,
  };

  const client = new S3Client(clientConfig);
  return {
    send: function send(command) {
      return client.send(
        command as never,
      ) as Promise<ObjectStorageS3CommandOutput>;
    },
    createPresignedGetUrl: function createPresignedGetUrl(input) {
      const commandInput: GetObjectCommandInput = {
        Bucket: input.bucket,
        Key: input.key,
      };

      if (input.responseContentDisposition) {
        commandInput.ResponseContentDisposition =
          input.responseContentDisposition;
      }

      return getSignedUrl(client, new GetObjectCommand(commandInput), {
        expiresIn: input.expiresInSeconds,
      });
    },
    createPresignedPutUrl: function createPresignedPutUrl(input) {
      const commandInput: PutObjectCommandInput = {
        Bucket: input.bucket,
        Key: input.key,
      };

      if (input.contentType) {
        commandInput.ContentType = input.contentType;
      }

      return getSignedUrl(client, new PutObjectCommand(commandInput), {
        expiresIn: input.expiresInSeconds,
      });
    },
  };
}

export function createObjectStorageS3Client(
  input: ObjectStorageS3ClientInput,
): ObjectStorageS3Client {
  return objectStorageS3ClientFactory(input);
}

export function setObjectStorageS3ClientFactoryForTests(
  factory: ObjectStorageS3ClientFactory,
): void {
  objectStorageS3ClientFactory = factory;
}

export function resetObjectStorageS3ClientFactoryForTests(): void {
  objectStorageS3ClientFactory = createAwsObjectStorageS3Client;
}

export async function listObjectStorageS3Objects(input: {
  client: ObjectStorageS3Client;
  bucket: string;
  bucketId: string;
  prefix: string;
  cursor?: string | null;
  maxKeys?: number;
}): Promise<ObjectStorageBucketObjectList> {
  const maxKeys = Math.min(Math.max(input.maxKeys ?? 100, 1), 1000);
  const prefix = normalizeObjectStorageObjectPrefix(input.prefix);
  const output = (await input.client.send(
    new ListObjectsV2Command({
      Bucket: input.bucket,
      Prefix: prefix,
      ContinuationToken: input.cursor ?? undefined,
      MaxKeys: maxKeys,
    }),
  )) as ListObjectsV2CommandOutput;

  return {
    bucketId: input.bucketId,
    prefix,
    nextCursor:
      output.IsTruncated && output.NextContinuationToken
        ? output.NextContinuationToken
        : null,
    objects: (output.Contents ?? [])
      .filter(function hasObjectKey(item) {
        return typeof item.Key === "string" && item.Key.length > 0;
      })
      .map(function toObject(item) {
        return {
          key: item.Key ?? "",
          size: item.Size ?? 0,
          lastModified: item.LastModified ? item.LastModified.getTime() : null,
          etag: item.ETag ?? null,
        };
      }),
  };
}

export async function configureObjectStorageS3BucketCors(input: {
  client: ObjectStorageS3Client;
  bucket: string;
}): Promise<void> {
  await input.client.send(
    new PutBucketCorsCommand({
      Bucket: input.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT", "DELETE"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

export async function createObjectStorageS3ObjectUploadUrl(input: {
  client: ObjectStorageS3Client;
  bucket: string;
  key: string;
  expiresInSeconds?: number | null;
  contentType?: string | null;
}): Promise<{
  url: string;
  key: string;
  headers: Record<string, string>;
  expiresAt: number;
}> {
  const key = normalizeObjectStorageObjectKey(input.key);

  if (!input.client.createPresignedPutUrl) {
    throw new Error("S3 client does not support presigned uploads");
  }

  const expiresInSeconds = normalizeObjectStoragePresignedUrlExpiresInSeconds(
    input.expiresInSeconds,
  );
  const url = await input.client.createPresignedPutUrl({
    bucket: input.bucket,
    key,
    expiresInSeconds,
    contentType: input.contentType,
  });
  const headers: Record<string, string> = {};

  if (input.contentType) {
    headers["Content-Type"] = input.contentType;
  }

  return {
    url,
    key,
    headers,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

export async function createObjectStorageS3ObjectDownloadUrl(input: {
  client: ObjectStorageS3Client;
  bucket: string;
  key: string;
  expiresInSeconds?: number | null;
  disposition?: ObjectStorageObjectDownloadDisposition;
}): Promise<{ url: string; expiresAt: number }> {
  const key = normalizeObjectStorageObjectKey(input.key);
  const expiresInSeconds = normalizeObjectStoragePresignedUrlExpiresInSeconds(
    input.expiresInSeconds,
  );

  if (!input.client.createPresignedGetUrl) {
    throw new Error("S3 client does not support presigned URLs");
  }

  const url = await input.client.createPresignedGetUrl({
    bucket: input.bucket,
    key,
    expiresInSeconds,
    responseContentDisposition: input.disposition
      ? getObjectStorageContentDisposition(input.disposition, key)
      : undefined,
  });

  return {
    url,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

export async function deleteObjectStorageS3Object(input: {
  client: ObjectStorageS3Client;
  bucket: string;
  key: string;
}): Promise<void> {
  await input.client.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: normalizeObjectStorageObjectKey(input.key),
    }),
  );
}
