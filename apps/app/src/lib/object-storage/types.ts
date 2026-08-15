import type { Selectable } from "kysely";
import type {
  Deployments,
  ObjectStorageAccessKeys,
  ObjectStorageBuckets,
  ObjectStorages,
} from "../db-types";
import type {
  ServiceAttentionStatus,
  ServiceRuntimeStatus,
} from "../service-runtime-status";

export type ObjectStorageAccessKeyPermission =
  Selectable<ObjectStorageAccessKeys>["permissions"];

export interface ObjectStorageWithRuntime extends Selectable<ObjectStorages> {
  endpoint: string | null;
  runtimeStatus: ServiceRuntimeStatus;
  attentionStatus: ServiceAttentionStatus;
  hostPort: number | null;
}

export interface ObjectStorageDetails {
  objectStorage: ObjectStorageWithRuntime;
  buckets: Selectable<ObjectStorageBuckets>[];
  accessKeys: Selectable<ObjectStorageAccessKeys>[];
  connection: ObjectStorageConnectionInfo;
}

export interface ObjectStorageConnectionInfo {
  endpoint: string | null;
  internalEndpoint: string;
  region: string;
  forcePathStyle: boolean;
}

export interface ObjectStorageConnectionSnippets {
  env: { key: string; value: string }[];
  awsCli: string;
  javascript: string;
}

export interface CreateObjectStorageInput {
  projectId: string;
  environmentId: string;
  name: string;
  bucketName?: string | null;
}

export interface CreateBucketInput {
  objectStorageId: string;
  name: string;
}

export interface CreateAccessKeyInput {
  objectStorageId: string;
  bucketId: string;
  name: string;
  permissions: ObjectStorageAccessKeyPermission;
}

export interface CreateAccessKeyResult {
  accessKey: Selectable<ObjectStorageAccessKeys>;
  secretAccessKey: string;
  snippets: ObjectStorageConnectionSnippets;
}

export interface ObjectStorageBucketObject {
  key: string;
  size: number;
  lastModified: number | null;
  etag: string | null;
}

export interface ObjectStorageBucketObjectList {
  bucketId: string;
  prefix: string;
  nextCursor: string | null;
  objects: ObjectStorageBucketObject[];
}

export interface ListBucketObjectsInput {
  objectStorageId: string;
  bucketId: string;
  prefix?: string | null;
  cursor?: string | null;
}

export interface CreateBucketObjectUploadUrlInput {
  objectStorageId: string;
  bucketId: string;
  key: string;
  contentType?: string | null;
  expiresInSeconds?: number | null;
}

export interface CreateBucketObjectUploadUrlResult {
  url: string;
  key: string;
  headers: Record<string, string>;
  expiresAt: number;
}

export type ObjectStorageObjectDownloadDisposition = "attachment" | "inline";

export interface CreateBucketObjectDownloadUrlInput {
  objectStorageId: string;
  bucketId: string;
  key: string;
  expiresInSeconds?: number | null;
  disposition?: ObjectStorageObjectDownloadDisposition;
}

export interface CreateBucketObjectDownloadUrlResult {
  url: string;
  expiresAt: number;
}

export interface DeleteBucketObjectInput {
  objectStorageId: string;
  bucketId: string;
  key: string;
}

export type ObjectStorageDeployment = Selectable<Deployments>;
