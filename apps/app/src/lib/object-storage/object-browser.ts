import {
  allowGarageKey,
  createGarageKey,
  deleteGarageKey,
} from "./garage-admin";
import type { ObjectStorageS3Credentials } from "./s3";
import type { ObjectStorageAccessKeyPermission } from "./types";

export interface ObjectBrowserSessionInput {
  containerId: string;
  bucketName: string;
  garageBucketId: string;
  permissions: ObjectStorageAccessKeyPermission;
  namePrefix: string;
  keyExpiration?: Date;
}

export interface ObjectBrowserSession {
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

export async function createObjectBrowserSession(
  input: ObjectBrowserSessionInput,
): Promise<ObjectBrowserSession> {
  const garageKey = await createGarageKey(
    input.containerId,
    `frost-${input.namePrefix}-${input.bucketName}`,
    { expiration: input.keyExpiration },
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
      permissions: input.permissions,
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
