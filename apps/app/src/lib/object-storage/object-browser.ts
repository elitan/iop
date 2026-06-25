import {
  allowGarageKey,
  createGarageKey,
  deleteGarageKey,
} from "./garage-admin";
import type { ObjectStorageS3Credentials } from "./s3";

interface ObjectBrowserReadSessionInput {
  containerId: string;
  bucketName: string;
  garageBucketId: string;
}

export interface ObjectBrowserReadSession {
  credentials: ObjectStorageS3Credentials;
  cleanup(): Promise<void>;
}

async function cleanupGarageKey(
  containerId: string,
  accessKeyId: string,
): Promise<void> {
  await deleteGarageKey(containerId, accessKeyId).catch(
    function ignoreCleanupError() {},
  );
}

export async function createObjectBrowserReadSession(
  input: ObjectBrowserReadSessionInput,
): Promise<ObjectBrowserReadSession> {
  const garageKey = await createGarageKey(
    input.containerId,
    `frost-list-${input.bucketName}`,
  );

  if (!garageKey.secretAccessKey) {
    await cleanupGarageKey(input.containerId, garageKey.accessKeyId);
    throw new Error("Garage did not return the secret access key");
  }

  try {
    await allowGarageKey({
      containerId: input.containerId,
      bucketId: input.garageBucketId,
      accessKeyId: garageKey.accessKeyId,
      permissions: "read-only",
    });
  } catch (error) {
    await cleanupGarageKey(input.containerId, garageKey.accessKeyId);
    throw error;
  }

  return {
    credentials: {
      accessKeyId: garageKey.accessKeyId,
      secretAccessKey: garageKey.secretAccessKey,
    },
    cleanup: function cleanup() {
      return cleanupGarageKey(input.containerId, garageKey.accessKeyId);
    },
  };
}
