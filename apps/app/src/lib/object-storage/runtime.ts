import { randomBytes } from "node:crypto";
import type { Selectable } from "kysely";
import { db } from "../db";
import type { Deployments, ObjectStorages, Services } from "../db-types";
import { deployService } from "../deployer";
import { addLatestDeploymentWithRuntimeStatus } from "../deployment-runtime";
import { getServerIp, getSystemDomainForService } from "../domains";
import { newRuntimeServiceId } from "../id";
import { cleanupService } from "../lifecycle";
import { createService } from "../services";
import { slugify } from "../slugify";
import {
  GARAGE_IMAGE,
  GARAGE_PROVISION_TIMEOUT_MS,
  GARAGE_REGION,
  GARAGE_S3_PORT,
  getObjectStorageClientRegion,
} from "./config";
import { objectStorageNotReady } from "./errors";
import type {
  ObjectStorageConnectionInfo,
  ObjectStorageWithRuntime,
} from "./types";

type DeployServiceFn = typeof deployService;

interface RuntimeSecrets {
  adminToken: string;
  metricsToken: string;
  rpcSecret: string;
}

interface CreateRuntimeServiceInput {
  environmentId: string;
  projectName: string;
  projectHostname: string | null;
  environmentName: string;
  environmentType: string;
  slug: string;
  secrets: RuntimeSecrets;
}

export interface CreatedObjectStorageRuntime {
  service: Selectable<Services>;
  internalEndpoint: string;
  externalEndpoint: string | null;
}

let deployServiceFn: DeployServiceFn = deployService;

function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise(function onResolve(resolve) {
    setTimeout(resolve, ms);
  });
}

function getDeploymentFailureReason(buildLog: string | null): string {
  const lines = buildLog
    ?.split("\n")
    .map(function trimLine(line) {
      return line.trim();
    })
    .filter(function hasContent(line) {
      return line.length > 0;
    });
  const lastLine = lines?.at(-1);
  return lastLine ? `: ${lastLine}` : "";
}

async function getUniqueRuntimeHostname(
  environmentId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await db
      .selectFrom("services")
      .select("id")
      .where("environmentId", "=", environmentId)
      .where("hostname", "=", candidate)
      .executeTakeFirst();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique object storage hostname");
}

async function getUniqueRuntimeServiceName(
  environmentId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await db
      .selectFrom("services")
      .select("id")
      .where("environmentId", "=", environmentId)
      .where("name", "=", candidate)
      .executeTakeFirst();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique object storage service name");
}

export function createObjectStorageRuntimeSecrets(): RuntimeSecrets {
  return {
    adminToken: randomSecret(),
    metricsToken: randomSecret(),
    rpcSecret: randomHex(),
  };
}

export function setObjectStorageDeployServiceForTests(
  deployFn: DeployServiceFn,
): void {
  deployServiceFn = deployFn;
}

export function resetObjectStorageDeployServiceForTests(): void {
  deployServiceFn = deployService;
}

export async function deployObjectStorageRuntimeService(
  serviceId: string,
): Promise<string> {
  return deployServiceFn(serviceId);
}

export async function waitForObjectStorageDeploymentContainer(
  deploymentId: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? GARAGE_PROVISION_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const deployment = await db
      .selectFrom("deployments")
      .select(["status", "containerId", "buildLog"])
      .where("id", "=", deploymentId)
      .executeTakeFirst();

    if (!deployment) {
      throw objectStorageNotReady("Object storage deployment was not found");
    }

    if (deployment.status === "running") {
      if (deployment.containerId) {
        return deployment.containerId;
      }
      throw objectStorageNotReady(
        "Object storage deployment is running without a container",
      );
    }

    if (
      deployment.status === "failed" ||
      deployment.status === "cancelled" ||
      deployment.status === "stopped"
    ) {
      throw objectStorageNotReady(
        `Object storage deployment ${deployment.status}${getDeploymentFailureReason(
          deployment.buildLog,
        )}`,
      );
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(pollMs, remainingMs));
  }

  throw objectStorageNotReady(
    "Object storage deployment did not start before timeout",
  );
}

export async function getObjectStorageServerIp(): Promise<string | null> {
  if (process.env.NODE_ENV === "development") {
    return "localhost";
  }
  return getServerIp().catch(function ignoreServerIpError() {
    return null;
  });
}

export function resolveObjectStorageEndpoint(input: {
  externalEndpoint: string | null;
  serverIp: string | null;
  hostPort: number | null;
}): string | null {
  if (input.externalEndpoint) {
    return input.externalEndpoint;
  }
  if (input.serverIp && input.hostPort) {
    return `http://${input.serverIp}:${input.hostPort}`;
  }
  return null;
}

export function getObjectStorageConnectionInfo(
  objectStorage: ObjectStorageWithRuntime,
): ObjectStorageConnectionInfo {
  return {
    endpoint: objectStorage.endpoint,
    internalEndpoint: objectStorage.internalEndpoint,
    region: objectStorage.region,
    forcePathStyle: true,
  };
}

export async function createObjectStorageRuntimeService(
  input: CreateRuntimeServiceInput,
): Promise<CreatedObjectStorageRuntime> {
  const serviceHostname = await getUniqueRuntimeHostname(
    input.environmentId,
    `s3-${input.slug}`,
  );
  const runtimeServiceName = await getUniqueRuntimeServiceName(
    input.environmentId,
    `object-storage-${input.slug}`,
  );
  const internalEndpoint = `http://${serviceHostname}:${GARAGE_S3_PORT}`;
  const projectHostname = input.projectHostname ?? slugify(input.projectName);
  const environmentName =
    input.environmentType === "production"
      ? undefined
      : slugify(input.environmentName);

  const service = await createService({
    id: newRuntimeServiceId(),
    environmentId: input.environmentId,
    name: runtimeServiceName,
    hostname: serviceHostname,
    deployType: "image",
    serviceType: "object-storage",
    imageUrl: GARAGE_IMAGE,
    envVars: [
      { key: "GARAGE_ADMIN_TOKEN", value: input.secrets.adminToken },
      { key: "GARAGE_METRICS_TOKEN", value: input.secrets.metricsToken },
      { key: "GARAGE_RPC_SECRET", value: input.secrets.rpcSecret },
      { key: "S3_ENDPOINT", value: internalEndpoint },
      { key: "S3_REGION", value: GARAGE_REGION },
      { key: "S3_FORCE_PATH_STYLE", value: "true" },
    ],
    containerPort: GARAGE_S3_PORT,
    healthCheckPath: null,
    healthCheckTimeout: 90,
    volumes: [
      { name: "meta", path: "/var/lib/garage/meta" },
      { name: "data", path: "/var/lib/garage/data" },
    ],
    icon: null,
    autoDeploy: false,
    wildcardDomain: { projectHostname, environmentName },
  });

  const systemDomain = await getSystemDomainForService(service.id);
  const externalEndpoint = systemDomain
    ? `https://${systemDomain.domain}`
    : null;

  return { service, internalEndpoint, externalEndpoint };
}

export async function getRuntimeContainerId(
  objectStorage: Selectable<ObjectStorages>,
): Promise<string> {
  const service = await db
    .selectFrom("services")
    .select(["id", "currentDeploymentId"])
    .where("id", "=", objectStorage.runtimeServiceId)
    .executeTakeFirst();

  if (!service?.currentDeploymentId) {
    throw objectStorageNotReady("Object storage runtime is not deployed");
  }

  const deployment = await db
    .selectFrom("deployments")
    .select(["containerId", "status"])
    .where("id", "=", service.currentDeploymentId)
    .executeTakeFirst();

  if (!deployment?.containerId || deployment.status !== "running") {
    throw objectStorageNotReady("Object storage runtime is not running");
  }

  return deployment.containerId;
}

export async function getLatestRuntimeDeployment(
  runtimeServiceId: string,
): Promise<Selectable<Deployments> | null> {
  return (
    (await db
      .selectFrom("deployments")
      .selectAll()
      .where("serviceId", "=", runtimeServiceId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function attachObjectStorageRuntime(
  objectStorage: Selectable<ObjectStorages>,
  options: { serverIp: string | null },
): Promise<ObjectStorageWithRuntime> {
  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", objectStorage.runtimeServiceId)
    .executeTakeFirst();

  if (!service) {
    return {
      ...objectStorage,
      region: getObjectStorageClientRegion(objectStorage.region),
      endpoint: resolveObjectStorageEndpoint({
        externalEndpoint: objectStorage.externalEndpoint,
        serverIp: options.serverIp,
        hostPort: null,
      }),
      runtimeStatus: "offline",
      attentionStatus: null,
      hostPort: null,
    };
  }

  const runtimeService = await addLatestDeploymentWithRuntimeStatus(service);
  const hostPort = runtimeService.latestDeployment?.hostPort ?? null;
  return {
    ...objectStorage,
    region: getObjectStorageClientRegion(objectStorage.region),
    endpoint: resolveObjectStorageEndpoint({
      externalEndpoint: objectStorage.externalEndpoint,
      serverIp: options.serverIp,
      hostPort,
    }),
    runtimeStatus: runtimeService.runtimeStatus,
    attentionStatus: runtimeService.attentionStatus,
    hostPort,
  };
}

export async function cleanupObjectStorageRuntimeService(
  runtimeServiceId: string,
): Promise<void> {
  await cleanupService(runtimeServiceId);
  await db.deleteFrom("services").where("id", "=", runtimeServiceId).execute();
}
