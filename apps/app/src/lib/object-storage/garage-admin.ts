import { runCommand } from "../process-runner";
import { GARAGE_PROVISION_TIMEOUT_MS } from "./config";
import { getErrorMessage, objectStorageNotReady } from "./errors";
import type { ObjectStorageAccessKeyPermission } from "./types";

interface GarageBucketInfo {
  id: string;
}

interface GarageKeyInfo {
  accessKeyId: string;
  secretAccessKey?: string | null;
}

interface GarageBucketPermission {
  read?: boolean;
  write?: boolean;
  owner?: boolean;
}

export type GarageJsonApiRunner = (
  containerId: string,
  operation: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

let garageJsonApiRunner: GarageJsonApiRunner = runGarageJsonApi;

function sleep(ms: number): Promise<void> {
  return new Promise(function onResolve(resolve) {
    setTimeout(resolve, ms);
  });
}

async function runGarageJsonApi(
  containerId: string,
  operation: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const args = ["exec", containerId, "/garage", "json-api", operation];
  if (payload !== undefined) {
    args.push(JSON.stringify(payload));
  }

  const result = await runCommand({
    command: "docker",
    args,
    timeoutMs: 30000,
  });

  if (result.code !== 0 || result.timedOut) {
    throw new Error(
      result.error ||
        result.stderr ||
        `Garage ${operation} exited with code ${result.code}`,
    );
  }

  const output = result.stdout.trim();
  if (output.length === 0) {
    return null;
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`Garage ${operation} returned invalid JSON`);
  }
}

function parseGarageBucketInfo(value: unknown): GarageBucketInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Garage returned an invalid bucket response");
  }
  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Garage did not return a bucket id");
  }
  return { id };
}

function parseGarageKeyInfo(value: unknown): GarageKeyInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Garage returned an invalid access key response");
  }
  const key = value as {
    accessKeyId?: unknown;
    secretAccessKey?: unknown;
  };
  if (typeof key.accessKeyId !== "string" || key.accessKeyId.length === 0) {
    throw new Error("Garage did not return an access key id");
  }
  return {
    accessKeyId: key.accessKeyId,
    secretAccessKey:
      typeof key.secretAccessKey === "string" ? key.secretAccessKey : null,
  };
}

export function setGarageJsonApiRunnerForTests(
  runner: GarageJsonApiRunner,
): void {
  garageJsonApiRunner = runner;
}

export function resetGarageJsonApiRunnerForTests(): void {
  garageJsonApiRunner = runGarageJsonApi;
}

export function getGaragePermissions(
  permissions: ObjectStorageAccessKeyPermission,
): GarageBucketPermission {
  switch (permissions) {
    case "read-only":
      return { read: true };
    case "read-write":
      return { read: true, write: true };
    case "full":
      return { read: true, write: true, owner: true };
  }
}

export async function waitForGarageReady(containerId: string): Promise<void> {
  const deadline = Date.now() + GARAGE_PROVISION_TIMEOUT_MS;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      await garageJsonApiRunner(containerId, "GetClusterHealth");
      return;
    } catch (error) {
      lastError = new Error(getErrorMessage(error));
      await sleep(1000);
    }
  }

  throw objectStorageNotReady(
    lastError
      ? `Garage did not become ready: ${lastError.message}`
      : "Garage did not become ready",
  );
}

export async function createGarageBucket(
  containerId: string,
  name: string,
): Promise<GarageBucketInfo> {
  const response = await garageJsonApiRunner(containerId, "CreateBucket", {
    globalAlias: name,
  });
  return parseGarageBucketInfo(response);
}

export async function deleteGarageBucket(
  containerId: string,
  bucketId: string,
): Promise<void> {
  await garageJsonApiRunner(containerId, "DeleteBucket", { id: bucketId });
}

export async function createGarageKey(
  containerId: string,
  name: string,
): Promise<GarageKeyInfo> {
  const response = await garageJsonApiRunner(containerId, "CreateKey", {
    name,
    neverExpires: true,
  });
  return parseGarageKeyInfo(response);
}

export async function allowGarageKey(input: {
  containerId: string;
  bucketId: string;
  accessKeyId: string;
  permissions: ObjectStorageAccessKeyPermission;
}): Promise<void> {
  await garageJsonApiRunner(input.containerId, "AllowBucketKey", {
    bucketId: input.bucketId,
    accessKeyId: input.accessKeyId,
    permissions: getGaragePermissions(input.permissions),
  });
}

export async function deleteGarageKey(
  containerId: string,
  accessKeyId: string,
): Promise<void> {
  await garageJsonApiRunner(containerId, "DeleteKey", { id: accessKeyId });
}
