import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { ObjectStorageBucketObjectList } from "./types";

export interface ObjectStorageS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ObjectStorageS3ClientInput {
  endpoint: string;
  region: string;
  credentials: ObjectStorageS3Credentials;
}

export interface ObjectStorageS3ListClient {
  send(command: ListObjectsV2Command): Promise<ListObjectsV2CommandOutput>;
}

export type ObjectStorageS3ClientFactory = (
  input: ObjectStorageS3ClientInput,
) => ObjectStorageS3ListClient;

let objectStorageS3ClientFactory: ObjectStorageS3ClientFactory =
  createAwsObjectStorageS3Client;

export function normalizeObjectStorageObjectPrefix(
  prefix: string | null | undefined,
): string {
  return (prefix ?? "").trim().replace(/^\/+/, "");
}

function createAwsObjectStorageS3Client(
  input: ObjectStorageS3ClientInput,
): ObjectStorageS3ListClient {
  const clientConfig: S3ClientConfig = {
    endpoint: input.endpoint,
    region: input.region,
    credentials: input.credentials,
    forcePathStyle: true,
  };

  return new S3Client(clientConfig);
}

export function createObjectStorageS3Client(
  input: ObjectStorageS3ClientInput,
): ObjectStorageS3ListClient {
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
  client: ObjectStorageS3ListClient;
  bucket: string;
  bucketId: string;
  prefix: string;
  cursor?: string | null;
  maxKeys?: number;
}): Promise<ObjectStorageBucketObjectList> {
  const maxKeys = Math.min(Math.max(input.maxKeys ?? 100, 1), 1000);
  const prefix = normalizeObjectStorageObjectPrefix(input.prefix);
  const output = await input.client.send(
    new ListObjectsV2Command({
      Bucket: input.bucket,
      Prefix: prefix,
      ContinuationToken: input.cursor ?? undefined,
      MaxKeys: maxKeys,
    }),
  );

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
