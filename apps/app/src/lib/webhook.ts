import { createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { getSetting } from "./auth";
import { db } from "./db";
import { removeNetwork, stopContainer } from "./docker";
import { getDomainsForService } from "./domains";
import { normalizeGitHubUrl, updatePRComment } from "./github";
import { getPreferredDomain } from "./service-url";
import { createService } from "./services";
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
  prTitle: string,
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
  const name = slugify(prTitle).substring(0, 50);

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

export async function updatePreviewEnvironmentName(
  projectId: string,
  prNumber: number,
  prTitle: string,
): Promise<void> {
  const name = slugify(prTitle).substring(0, 50);
  await db
    .updateTable("environments")
    .set({ name })
    .where("projectId", "=", projectId)
    .where("prNumber", "=", prNumber)
    .execute();
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
    serviceType: "app" | "database";
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
    volumes: string | null;
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

  const hostname = sourceService.hostname ?? slugify(sourceService.name);
  const envVars = sourceService.envVars
    ? (JSON.parse(sourceService.envVars) as { key: string; value: string }[])
    : [];
  const volumes = sourceService.volumes
    ? (JSON.parse(sourceService.volumes) as { name: string; path: string }[])
    : [];

  const service = await createService({
    environmentId: input.environmentId,
    name: sourceService.name,
    hostname,
    deployType: sourceService.deployType,
    serviceType: sourceService.serviceType,
    repoUrl: sourceService.repoUrl,
    branch: input.targetBranch,
    dockerfilePath: sourceService.dockerfilePath,
    buildContext: sourceService.buildContext,
    imageUrl: sourceService.imageUrl,
    envVars,
    containerPort: sourceService.containerPort,
    healthCheckPath: sourceService.healthCheckPath,
    healthCheckTimeout: sourceService.healthCheckTimeout,
    memoryLimit: sourceService.memoryLimit,
    cpuLimit: sourceService.cpuLimit,
    shutdownTimeout: sourceService.shutdownTimeout,
    registryId: sourceService.registryId,
    command: sourceService.command,
    volumes,
    autoDeploy: true,
    wildcardDomain: {
      projectHostname: input.projectHostname,
      environmentName: input.envName,
    },
  });

  return service.id;
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

export async function findPreviewEnvironment(
  projectId: string,
  prNumber: number,
) {
  return db
    .selectFrom("environments")
    .selectAll()
    .where("projectId", "=", projectId)
    .where("prNumber", "=", prNumber)
    .executeTakeFirst();
}

export async function updateEnvironmentPRCommentId(
  environmentId: string,
  commentId: number,
): Promise<void> {
  await db
    .updateTable("environments")
    .set({ prCommentId: commentId })
    .where("id", "=", environmentId)
    .execute();
}

export interface ServiceDeployStatus {
  id: string;
  name: string;
  hostname: string;
  status: string;
  url: string | null;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(date: Date): string {
  const month = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours24 >= 12 ? "pm" : "am";
  const hours = hours24 % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes}${ampm} UTC`;
}

export interface BuildPRCommentParams {
  services: ServiceDeployStatus[];
  branch: string;
  commitSha: string;
  projectId: string;
  environmentId: string;
  frostDomain: string | null;
}

function getStatusBadge(status: string, frostDomain: string | null): string {
  if (status === "running") {
    return frostDomain
      ? `![Ready](https://${frostDomain}/static/status/ready.svg)`
      : "🟢 Ready";
  }
  if (status === "failed") {
    return frostDomain
      ? `![Failed](https://${frostDomain}/static/status/failed.svg)`
      : "🔴 Failed";
  }
  return frostDomain
    ? `![Building](https://${frostDomain}/static/status/building.svg)`
    : "🟡 Building";
}

export function buildPRCommentBody(params: BuildPRCommentParams): string {
  const { services, branch, commitSha, projectId, environmentId, frostDomain } =
    params;

  const rows = services
    .map((s) => {
      const statusBadge = getStatusBadge(s.status, frostDomain);
      const serviceLink = frostDomain
        ? `[${s.name}](https://${frostDomain}/projects/${projectId}/environments/${environmentId}/services/${s.id})`
        : s.name;
      const preview = s.url ? `[Visit](${s.url})` : "-";
      return `| ${serviceLink} | ${statusBadge} | ${preview} |`;
    })
    .join("\n");

  const now = formatDate(new Date());

  return `| Service | Status | Preview |
|---------|--------|---------|
${rows}

**Branch:** \`${branch}\` · **Commit:** \`${commitSha.substring(0, 7)}\` · *Updated: ${now}*`;
}

export async function getEnvironmentServiceStatuses(
  environmentId: string,
): Promise<ServiceDeployStatus[]> {
  const services = await db
    .selectFrom("services")
    .select(["id", "name", "hostname"])
    .where("environmentId", "=", environmentId)
    .execute();

  const statuses: ServiceDeployStatus[] = [];

  for (const service of services) {
    const deployment = await db
      .selectFrom("deployments")
      .select("status")
      .where("serviceId", "=", service.id)
      .orderBy("createdAt", "desc")
      .executeTakeFirst();

    const hostname = service.hostname ?? slugify(service.name);

    let url: string | null = null;
    if (deployment?.status === "running") {
      const domains = await getDomainsForService(service.id);
      const preferred = getPreferredDomain(domains);
      if (preferred) {
        url = `https://${preferred.domain}`;
      }
    }

    statuses.push({
      id: service.id,
      name: service.name,
      hostname,
      status: deployment?.status ?? "pending",
      url,
    });
  }

  return statuses;
}

export async function updateEnvironmentPRComment(
  environmentId: string,
  repoUrl: string | null,
): Promise<void> {
  if (!repoUrl) return;

  const env = await db
    .selectFrom("environments")
    .select(["prCommentId", "prBranch", "projectId"])
    .where("id", "=", environmentId)
    .executeTakeFirst();

  if (!env?.prCommentId || !env.prBranch) return;

  const [latestDeployment, statuses, frostDomain] = await Promise.all([
    db
      .selectFrom("deployments")
      .select("commitSha")
      .where("environmentId", "=", environmentId)
      .orderBy("createdAt", "desc")
      .executeTakeFirst(),
    getEnvironmentServiceStatuses(environmentId),
    getSetting("domain"),
  ]);

  const body = buildPRCommentBody({
    services: statuses,
    branch: env.prBranch,
    commitSha: latestDeployment?.commitSha ?? "HEAD",
    projectId: env.projectId,
    environmentId,
    frostDomain,
  });

  await updatePRComment(repoUrl, env.prCommentId, body);
}
