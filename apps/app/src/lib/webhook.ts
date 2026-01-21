import { createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db";
import { removeNetwork, stopContainer } from "./docker";
import { createWildcardDomain } from "./domains";
import { normalizeGitHubUrl } from "./github";
import { slugify } from "./slugify";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function shouldTriggerDeploy(
  ref: string,
  defaultBranch: string,
): boolean {
  const expectedRef = `refs/heads/${defaultBranch}`;
  return ref === expectedRef;
}

export async function findMatchingServices(webhookRepoUrl: string) {
  const normalizedWebhookUrl = normalizeGitHubUrl(webhookRepoUrl);

  const services = await db
    .selectFrom("services")
    .selectAll()
    .where("deployType", "=", "repo")
    .where("autoDeploy", "=", true)
    .execute();

  return services.filter((service) => {
    if (!service.repoUrl) return false;
    return normalizeGitHubUrl(service.repoUrl) === normalizedWebhookUrl;
  });
}

export async function hasExistingDeployment(
  serviceId: string,
  commitSha: string,
): Promise<boolean> {
  const activeStatuses = [
    "pending",
    "cloning",
    "building",
    "deploying",
    "running",
  ] as const;
  const existing = await db
    .selectFrom("deployments")
    .select("id")
    .where("serviceId", "=", serviceId)
    .where("commitSha", "=", commitSha.substring(0, 7))
    .where("status", "in", [...activeStatuses])
    .executeTakeFirst();

  return existing !== undefined;
}

export async function findProductionServicesForRepo(webhookRepoUrl: string) {
  const normalizedWebhookUrl = normalizeGitHubUrl(webhookRepoUrl);

  const services = await db
    .selectFrom("services")
    .innerJoin("environments", "environments.id", "services.environmentId")
    .innerJoin("projects", "projects.id", "environments.projectId")
    .selectAll("services")
    .select([
      "projects.id as projectId",
      "projects.hostname as projectHostname",
    ])
    .where("services.deployType", "=", "repo")
    .where("environments.type", "=", "production")
    .execute();

  return services.filter((service) => {
    if (!service.repoUrl) return false;
    return normalizeGitHubUrl(service.repoUrl) === normalizedWebhookUrl;
  });
}

export async function createPreviewEnvironment(
  projectId: string,
  prNumber: number,
  prBranch: string,
): Promise<string> {
  const existing = await db
    .selectFrom("environments")
    .select("id")
    .where("projectId", "=", projectId)
    .where("prNumber", "=", prNumber)
    .executeTakeFirst();

  if (existing) {
    return existing.id;
  }

  const id = nanoid();
  const now = Date.now();
  const name = `pr-${prNumber}`;

  await db
    .insertInto("environments")
    .values({
      id,
      projectId,
      name,
      type: "preview",
      prNumber,
      prBranch,
      isEphemeral: true,
      createdAt: now,
    })
    .execute();

  return id;
}

interface CloneServiceInput {
  environmentId: string;
  projectHostname: string;
  envName: string;
  targetBranch: string;
}

export async function cloneServiceToEnvironment(
  sourceService: {
    id: string;
    name: string;
    hostname: string | null;
    deployType: "repo" | "image";
    repoUrl: string | null;
    branch: string | null;
    dockerfilePath: string | null;
    buildContext: string | null;
    imageUrl: string | null;
    envVars: string;
    containerPort: number | null;
    healthCheckPath: string | null;
    healthCheckTimeout: number | null;
    memoryLimit: string | null;
    cpuLimit: number | null;
    shutdownTimeout: number | null;
    registryId: string | null;
    command: string | null;
  },
  input: CloneServiceInput,
): Promise<string> {
  const existing = await db
    .selectFrom("services")
    .select("id")
    .where("environmentId", "=", input.environmentId)
    .where("name", "=", sourceService.name)
    .executeTakeFirst();

  if (existing) {
    return existing.id;
  }

  const id = nanoid();
  const now = Date.now();
  const hostname = sourceService.hostname ?? slugify(sourceService.name);

  await db
    .insertInto("services")
    .values({
      id,
      environmentId: input.environmentId,
      name: sourceService.name,
      hostname,
      deployType: sourceService.deployType,
      repoUrl: sourceService.repoUrl,
      branch: input.targetBranch,
      dockerfilePath: sourceService.dockerfilePath,
      buildContext: sourceService.buildContext,
      imageUrl: sourceService.imageUrl,
      envVars: sourceService.envVars,
      containerPort: sourceService.containerPort,
      healthCheckPath: sourceService.healthCheckPath,
      healthCheckTimeout: sourceService.healthCheckTimeout,
      memoryLimit: sourceService.memoryLimit,
      cpuLimit: sourceService.cpuLimit,
      shutdownTimeout: sourceService.shutdownTimeout,
      registryId: sourceService.registryId,
      command: sourceService.command,
      autoDeploy: true,
      createdAt: now,
    })
    .execute();

  await createWildcardDomain(
    id,
    input.environmentId,
    hostname,
    input.projectHostname,
    input.envName,
  );

  return id;
}

export async function cleanupEnvironment(environment: {
  id: string;
  projectId: string;
}): Promise<void> {
  const deployments = await db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("environmentId", "=", environment.id)
    .execute();

  for (const deployment of deployments) {
    if (deployment.containerId) {
      await stopContainer(deployment.containerId);
    }
  }

  await removeNetwork(
    `frost-net-${environment.projectId}-${environment.id}`.toLowerCase(),
  );
  await db
    .deleteFrom("environments")
    .where("id", "=", environment.id)
    .execute();
}

export async function deletePreviewEnvironment(
  projectId: string,
  prNumber: number,
): Promise<boolean> {
  const environment = await db
    .selectFrom("environments")
    .select(["id", "projectId"])
    .where("projectId", "=", projectId)
    .where("prNumber", "=", prNumber)
    .executeTakeFirst();

  if (!environment) {
    return false;
  }

  await cleanupEnvironment(environment);
  return true;
}
