import { ORPCError } from "@orpc/server";
import {
  createObjectStorage,
  createObjectStorageAccessKey,
  createObjectStorageBucket,
  deleteObjectStorage,
  deleteObjectStorageBucket,
  getObjectStorageDetails,
  listObjectStorageBucketObjects,
  listObjectStoragesByProject,
  ObjectStorageError,
  revokeObjectStorageAccessKey,
} from "@/lib/object-storage";
import { assertDemoServiceCreateAllowed } from "./demo-guards";
import { os } from "./orpc";

function toApiError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof ObjectStorageError) {
    switch (error.code) {
      case "not_found":
        return new ORPCError("NOT_FOUND", { message: error.message });
      case "conflict":
        return new ORPCError("CONFLICT", { message: error.message });
      case "not_ready":
      case "validation":
        return new ORPCError("BAD_REQUEST", { message: error.message });
    }
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

type ObjectStorageAction<T> = () => Promise<T>;

async function handleObjectStorageAction<T>(
  action: ObjectStorageAction<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw toApiError(error);
  }
}

export const objectStorages = {
  create: os.objectStorages.create.handler(function createHandler({ input }) {
    return handleObjectStorageAction(async function createAction() {
      await assertDemoServiceCreateAllowed(input.environmentId);
      return createObjectStorage(input);
    });
  }),

  list: os.objectStorages.list.handler(function listHandler({ input }) {
    return listObjectStoragesByProject(input.projectId);
  }),

  get: os.objectStorages.get.handler(function getHandler({ input }) {
    return handleObjectStorageAction(function getAction() {
      return getObjectStorageDetails(input.objectStorageId);
    });
  }),

  delete: os.objectStorages.delete.handler(function deleteHandler({ input }) {
    return handleObjectStorageAction(async function deleteAction() {
      await deleteObjectStorage(input.objectStorageId);
      return { success: true };
    });
  }),

  createBucket: os.objectStorages.createBucket.handler(
    function createBucketHandler({ input }) {
      return handleObjectStorageAction(function createBucketAction() {
        return createObjectStorageBucket(input);
      });
    },
  ),

  deleteBucket: os.objectStorages.deleteBucket.handler(
    function deleteBucketHandler({ input }) {
      return handleObjectStorageAction(async function deleteBucketAction() {
        await deleteObjectStorageBucket(input);
        return { success: true };
      });
    },
  ),

  listBucketObjects: os.objectStorages.listBucketObjects.handler(
    function listBucketObjectsHandler({ input }) {
      return handleObjectStorageAction(function listBucketObjectsAction() {
        return listObjectStorageBucketObjects(input);
      });
    },
  ),

  createAccessKey: os.objectStorages.createAccessKey.handler(
    function createAccessKeyHandler({ input }) {
      return handleObjectStorageAction(function createAccessKeyAction() {
        return createObjectStorageAccessKey(input);
      });
    },
  ),

  revokeAccessKey: os.objectStorages.revokeAccessKey.handler(
    function revokeAccessKeyHandler({ input }) {
      return handleObjectStorageAction(async function revokeAccessKeyAction() {
        await revokeObjectStorageAccessKey(input);
        return { success: true };
      });
    },
  ),
};
