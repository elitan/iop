import type { deployService } from "./deployer";
import {
  type GarageJsonApiRunner,
  resetGarageJsonApiRunnerForTests,
  setGarageJsonApiRunnerForTests,
} from "./object-storage/garage-admin";
import {
  resetObjectStorageDeployServiceForTests,
  setObjectStorageDeployServiceForTests,
} from "./object-storage/runtime";
import {
  type ObjectStorageS3ClientFactory,
  resetObjectStorageS3ClientFactoryForTests,
  setObjectStorageS3ClientFactoryForTests,
} from "./object-storage/s3";

export {
  ObjectStorageError,
  type ObjectStorageErrorCode,
} from "./object-storage/errors";
export {
  type GarageJsonApiRunner,
  getGaragePermissions,
} from "./object-storage/garage-admin";
export {
  normalizeBucketName,
  normalizeObjectStorageName,
} from "./object-storage/naming";
export {
  createObjectStorage,
  createObjectStorageAccessKey,
  createObjectStorageBucket,
  createObjectStorageBucketObjectDownloadUrl,
  createObjectStorageBucketObjectUploadUrl,
  deleteObjectStorage,
  deleteObjectStorageBucket,
  deleteObjectStorageBucketObject,
  getObjectStorageDetails,
  getObjectStorageLatestDeployment,
  listObjectStorageBucketObjects,
  listObjectStoragesByProject,
  revokeObjectStorageAccessKey,
} from "./object-storage/repository";
export { waitForObjectStorageDeploymentContainer } from "./object-storage/runtime";
export {
  configureObjectStorageS3BucketCors,
  createObjectStorageS3ObjectDownloadUrl,
  createObjectStorageS3ObjectUploadUrl,
  deleteObjectStorageS3Object,
  listObjectStorageS3Objects,
  normalizeObjectStorageObjectKey,
  normalizeObjectStorageObjectPrefix,
  normalizeObjectStoragePresignedUrlExpiresInSeconds,
} from "./object-storage/s3";
export { buildObjectStorageConnectionSnippets } from "./object-storage/snippets";
export type {
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
  ObjectStorageAccessKeyPermission,
  ObjectStorageBucketObject,
  ObjectStorageBucketObjectList,
  ObjectStorageConnectionInfo,
  ObjectStorageConnectionSnippets,
  ObjectStorageDeployment,
  ObjectStorageDetails,
  ObjectStorageObjectDownloadDisposition,
  ObjectStorageWithRuntime,
} from "./object-storage/types";

export function setObjectStorageRuntimeForTests(fns: {
  deployService?: typeof deployService;
  garageJsonApi?: GarageJsonApiRunner;
  s3ClientFactory?: ObjectStorageS3ClientFactory;
}): void {
  if (fns.deployService) {
    setObjectStorageDeployServiceForTests(fns.deployService);
  }
  if (fns.garageJsonApi) {
    setGarageJsonApiRunnerForTests(fns.garageJsonApi);
  }
  if (fns.s3ClientFactory) {
    setObjectStorageS3ClientFactoryForTests(fns.s3ClientFactory);
  }
}

export function resetObjectStorageRuntimeForTests(): void {
  resetObjectStorageDeployServiceForTests();
  resetGarageJsonApiRunnerForTests();
  resetObjectStorageS3ClientFactoryForTests();
}
