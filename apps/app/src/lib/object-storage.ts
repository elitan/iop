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
  deleteObjectStorage,
  deleteObjectStorageBucket,
  getObjectStorageDetails,
  getObjectStorageLatestDeployment,
  listObjectStorageBucketObjects,
  listObjectStoragesByProject,
  revokeObjectStorageAccessKey,
} from "./object-storage/repository";
export { waitForObjectStorageDeploymentContainer } from "./object-storage/runtime";
export {
  listObjectStorageS3Objects,
  normalizeObjectStorageObjectPrefix,
} from "./object-storage/s3";
export { buildObjectStorageConnectionSnippets } from "./object-storage/snippets";
export type {
  CreateAccessKeyInput,
  CreateAccessKeyResult,
  CreateBucketInput,
  CreateObjectStorageInput,
  ListBucketObjectsInput,
  ObjectStorageAccessKeyPermission,
  ObjectStorageBucketObject,
  ObjectStorageBucketObjectList,
  ObjectStorageConnectionInfo,
  ObjectStorageConnectionSnippets,
  ObjectStorageDeployment,
  ObjectStorageDetails,
  ObjectStorageWithRuntime,
} from "./object-storage/types";

export function setObjectStorageRuntimeForTests(fns: {
  deployService?: typeof deployService;
  garageJsonApi?: GarageJsonApiRunner;
}): void {
  if (fns.deployService) {
    setObjectStorageDeployServiceForTests(fns.deployService);
  }
  if (fns.garageJsonApi) {
    setGarageJsonApiRunnerForTests(fns.garageJsonApi);
  }
}

export function resetObjectStorageRuntimeForTests(): void {
  resetObjectStorageDeployServiceForTests();
  resetGarageJsonApiRunnerForTests();
}
