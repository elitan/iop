import { exec } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Selectable } from "kysely";
import { nanoid } from "nanoid";
import { decrypt } from "./crypto";
import { db } from "./db";
import type { Projects, Registries, Services } from "./db-types";
import {
  buildImage,
  createNetwork,
  dockerLogin,
  type FileMount,
  getAvailablePort,
  getContainerStatus,
  getRegistryUrl,
  imageExists,
  isContainerNameConflictError,
  isPortConflictError,
  pullImage,
  type RunContainerOptions,
  runContainer,
  stopContainer,
  type VolumeMount,
  waitForHealthy,
} from "./docker";
import { syncCaddyConfig } from "./domains";
import {
  createCommitStatus,
  generateInstallationToken,
  hasGitHubApp,
  injectTokenIntoUrl,
  isGitHubRepo,
} from "./github";
import { generateSelfSignedCert, getSSLPaths, sslCertsExist } from "./ssl";
import type { EnvVar } from "./types";
import { buildVolumeName, createVolume } from "./volumes";

const execAsync = promisify(exec);

const REPOS_PATH = join(process.cwd(), "repos");

if (!existsSync(REPOS_PATH)) {
  mkdirSync(REPOS_PATH, { recursive: true });
}

export type DeploymentStatus =
  | "pending"
  | "cloning"
  | "pulling"
  | "building"
  | "deploying"
  | "running"
  | "failed"
  | "cancelled";

async function updateDeployment(
  id: string,
  updates: {
    status?: DeploymentStatus;
    buildLog?: string;
    errorMessage?: string;
    containerId?: string;
    hostPort?: number;
    finishedAt?: number;
  },
) {
  await db
    .updateTable("deployments")
    .set(updates)
    .where("id", "=", id)
    .execute();
}

async function appendLog(id: string, log: string) {
  const deployment = await db
    .selectFrom("deployments")
    .select("buildLog")
    .where("id", "=", id)
    .executeTakeFirst();

  const existingLog = deployment?.buildLog || "";
  await updateDeployment(id, { buildLog: existingLog + log });
}

async function isDeploymentCancelled(deploymentId: string): Promise<boolean> {
  const deployment = await db
    .selectFrom("deployments")
    .select("status")
    .where("id", "=", deploymentId)
    .executeTakeFirst();
  return deployment?.status === "cancelled";
}

function sanitizeDockerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseEnvVars(envVarsJson: string): Record<string, string> {
  const envVarsList: EnvVar[] = envVarsJson ? JSON.parse(envVarsJson) : [];
  const envVars: Record<string, string> = {};
  for (const e of envVarsList) {
    envVars[e.key] = e.value;
  }
  return envVars;
}

const MAX_PORT_ATTEMPTS = 10;

async function runContainerWithPortRetry(
  options: Omit<RunContainerOptions, "hostPort">,
  onRetry?: (port: number, attempt: number) => Promise<void>,
): Promise<{ containerId: string; hostPort: number }> {
  const triedPorts = new Set<number>();

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const hostPort = await getAvailablePort(10000, 20000, triedPorts);
    triedPorts.add(hostPort);

    const result = await runContainer({ ...options, hostPort });

    if (result.success) {
      return { containerId: result.containerId, hostPort };
    }

    const error = result.error || "";
    const isRetryable =
      isPortConflictError(error) || isContainerNameConflictError(error);

    if (!isRetryable) {
      throw new Error(error || "Failed to start container");
    }

    if (isContainerNameConflictError(error)) {
      await stopContainer(options.name);
    }

    if (onRetry) {
      await onRetry(hostPort, attempt + 1);
    }
  }

  throw new Error(
    `Failed to allocate port after ${MAX_PORT_ATTEMPTS} attempts`,
  );
}

function detectRegistryFromImage(imageUrl: string): string | null {
  if (imageUrl.startsWith("ghcr.io/")) return "ghcr";
  if (imageUrl.startsWith("docker.io/") || !imageUrl.includes("/"))
    return "dockerhub";
  const match = imageUrl.match(/^([^/]+)\//);
  return match ? match[1] : null;
}

async function getRegistryForPull(
  service: Selectable<Services>,
): Promise<Selectable<Registries> | null> {
  if (service.registryId) {
    const registry = await db
      .selectFrom("registries")
      .selectAll()
      .where("id", "=", service.registryId)
      .executeTakeFirst();
    if (registry) return registry;
  }

  if (service.imageUrl) {
    const detected = detectRegistryFromImage(service.imageUrl);
    if (detected) {
      const registry = await db
        .selectFrom("registries")
        .selectAll()
        .where((eb) =>
          eb.or([eb("type", "=", detected), eb("url", "=", detected)]),
        )
        .executeTakeFirst();
      if (registry) return registry;
    }
  }

  return null;
}

function buildFrostEnvVars(
  deploymentId: string,
  service: Selectable<Services>,
  project: Selectable<Projects>,
  gitInfo?: { commitSha: string; branch: string },
): Record<string, string> {
  const vars: Record<string, string> = {
    FROST: "1",
    FROST_SERVICE_NAME: service.name,
    FROST_SERVICE_ID: service.id,
    FROST_PROJECT_NAME: project.name,
    FROST_PROJECT_ID: project.id,
    FROST_DEPLOYMENT_ID: deploymentId,
    FROST_INTERNAL_HOSTNAME: service.hostname ?? service.name,
  };
  if (gitInfo) {
    vars.FROST_GIT_COMMIT_SHA = gitInfo.commitSha;
    vars.FROST_GIT_BRANCH = gitInfo.branch;
  }
  return vars;
}

async function updateCommitStatusIfGitHub(
  repoUrl: string | null,
  commitSha: string,
  state: "pending" | "success" | "failure",
  description: string,
  deploymentId: string,
): Promise<void> {
  if (!repoUrl || !isGitHubRepo(repoUrl)) return;
  if (commitSha === "HEAD" || commitSha.length < 7) return;

  try {
    await createCommitStatus({
      repoUrl,
      commitSha,
      state,
      description,
      targetUrl: `/deployments/${deploymentId}`,
    });
  } catch (err) {
    console.warn("Failed to update commit status:", err);
  }
}

export interface DeployOptions {
  commitSha?: string;
  commitMessage?: string;
}

export async function deployProject(projectId: string): Promise<string[]> {
  const services = await db
    .selectFrom("services")
    .selectAll()
    .where("projectId", "=", projectId)
    .execute();

  if (services.length === 0) {
    throw new Error("No services to deploy");
  }

  const deploymentIds = await Promise.all(
    services.map((service) => deployService(service.id)),
  );

  return deploymentIds;
}

export async function deployService(
  serviceId: string,
  options?: DeployOptions,
): Promise<string> {
  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", serviceId)
    .executeTakeFirst();

  if (!service) {
    throw new Error("Service not found");
  }

  const project = await db
    .selectFrom("projects")
    .selectAll()
    .where("id", "=", service.projectId)
    .executeTakeFirst();

  if (!project) {
    throw new Error("Project not found");
  }

  const inProgressStatuses = [
    "pending",
    "cloning",
    "pulling",
    "building",
    "deploying",
  ];
  const activeDeployments = await db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("serviceId", "=", serviceId)
    .where("status", "in", inProgressStatuses)
    .execute();

  for (const dep of activeDeployments) {
    if (dep.containerId) {
      await stopContainer(dep.containerId);
    }
    await db
      .updateTable("deployments")
      .set({ status: "cancelled", finishedAt: Date.now() })
      .where("id", "=", dep.id)
      .execute();
  }

  const deploymentId = nanoid();
  const now = Date.now();

  await db
    .insertInto("deployments")
    .values({
      id: deploymentId,
      projectId: project.id,
      serviceId: serviceId,
      commitSha: options?.commitSha?.substring(0, 7) || "HEAD",
      commitMessage: options?.commitMessage || null,
      status: "pending",
      createdAt: now,
    })
    .execute();

  runServiceDeployment(deploymentId, service, project, options).catch((err) => {
    console.error("Deployment failed:", err);
  });

  return deploymentId;
}

async function runServiceDeployment(
  deploymentId: string,
  service: Selectable<Services>,
  project: Selectable<Projects>,
  options?: DeployOptions,
) {
  let currentCommitSha = options?.commitSha || "HEAD";
  const containerName = sanitizeDockerName(
    `frost-${service.id}-${deploymentId}`,
  );
  const networkName = sanitizeDockerName(`frost-net-${project.id}`);

  const baseLabels = {
    "frost.managed": "true",
    "frost.project.id": project.id,
    "frost.service.id": service.id,
    "frost.service.name": service.name,
  };

  const projectEnvVars = parseEnvVars(project.envVars);
  const serviceEnvVars = parseEnvVars(service.envVars);
  const envVars = { ...projectEnvVars, ...serviceEnvVars };
  const envVarsList: EnvVar[] = Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
  }));

  try {
    let imageName: string;

    if (service.deployType === "image") {
      if (!service.imageUrl) {
        throw new Error("Image URL is required for image deployments");
      }
      imageName = service.imageUrl;
      const imageTag = imageName.split(":")[1] || "latest";

      await updateDeployment(deploymentId, { status: "pulling" });

      const registry = await getRegistryForPull(service);
      if (registry) {
        const registryUrl = getRegistryUrl(registry.type, registry.url);
        await appendLog(
          deploymentId,
          `Logging into registry ${registryUrl}...\n`,
        );
        const password = decrypt(registry.passwordEncrypted);
        const loginResult = await dockerLogin(
          registryUrl,
          registry.username,
          password,
        );
        if (!loginResult.success) {
          throw new Error(`Registry login failed: ${loginResult.error}`);
        }
      }

      await appendLog(deploymentId, `Pulling image ${imageName}...\n`);

      const pullResult = await pullImage(imageName);
      await appendLog(deploymentId, pullResult.log);

      if (!pullResult.success) {
        throw new Error(pullResult.error || "Pull failed");
      }

      if (await isDeploymentCancelled(deploymentId)) {
        return;
      }

      await db
        .updateTable("deployments")
        .set({ commitSha: imageTag })
        .where("id", "=", deploymentId)
        .execute();
    } else {
      if (!service.repoUrl || !service.branch || !service.dockerfilePath) {
        throw new Error("Repo URL, branch, and Dockerfile path are required");
      }

      const repoPath = join(REPOS_PATH, deploymentId);

      await updateDeployment(deploymentId, { status: "cloning" });
      await appendLog(deploymentId, `Cloning ${service.repoUrl}...\n`);
      await updateCommitStatusIfGitHub(
        service.repoUrl,
        currentCommitSha,
        "pending",
        "Deployment started",
        deploymentId,
      );

      if (existsSync(repoPath)) {
        rmSync(repoPath, { recursive: true, force: true });
      }

      let cloneUrl = service.repoUrl;
      if (isGitHubRepo(service.repoUrl) && (await hasGitHubApp())) {
        try {
          const token = await generateInstallationToken(service.repoUrl);
          cloneUrl = injectTokenIntoUrl(service.repoUrl, token);
          await appendLog(
            deploymentId,
            "Using GitHub App for authentication\n",
          );
        } catch (err: any) {
          await appendLog(
            deploymentId,
            `Warning: GitHub App auth failed (${err.message}), trying without auth\n`,
          );
        }
      }

      const { stdout: cloneResult } = await execAsync(
        `git clone --depth 1 --branch ${service.branch} ${cloneUrl} ${repoPath}`,
      );
      await appendLog(deploymentId, cloneResult || "Cloned successfully\n");

      const { stdout: commitResult } = await execAsync(
        `git -C ${repoPath} rev-parse HEAD`,
      );
      const commitSha = commitResult.trim().substring(0, 7);
      const fullCommitSha = commitResult.trim();
      currentCommitSha = fullCommitSha;

      await db
        .updateTable("deployments")
        .set({
          commitSha: commitSha,
          gitCommitSha: fullCommitSha,
          gitBranch: service.branch,
        })
        .where("id", "=", deploymentId)
        .execute();

      if (envVarsList.length > 0) {
        const envFileContent = envVarsList
          .map((e) => `${e.key}=${e.value}`)
          .join("\n");
        writeFileSync(join(repoPath, ".env"), envFileContent);
        await appendLog(
          deploymentId,
          `Written ${envVarsList.length} env vars to .env\n`,
        );
      }

      await updateDeployment(deploymentId, { status: "building" });
      await appendLog(deploymentId, `\nBuilding image...\n`);
      await updateCommitStatusIfGitHub(
        service.repoUrl,
        currentCommitSha,
        "pending",
        "Building...",
        deploymentId,
      );

      imageName = `${sanitizeDockerName(`frost-${project.id}-${service.name}`)}:${commitSha}`;
      const buildResult = await buildImage({
        repoPath,
        imageName,
        dockerfilePath: service.dockerfilePath,
        envVars,
        labels: baseLabels,
      });

      await appendLog(deploymentId, buildResult.log);

      if (!buildResult.success) {
        throw new Error(buildResult.error || "Build failed");
      }

      if (await isDeploymentCancelled(deploymentId)) {
        return;
      }
    }

    await db
      .updateTable("deployments")
      .set({ imageName })
      .where("id", "=", deploymentId)
      .execute();

    await updateDeployment(deploymentId, { status: "deploying" });
    await appendLog(deploymentId, `\nStarting container...\n`);
    await updateCommitStatusIfGitHub(
      service.repoUrl,
      currentCommitSha,
      "pending",
      "Deploying...",
      deploymentId,
    );

    await createNetwork(networkName, baseLabels);

    let volumes: VolumeMount[] | undefined;
    if (service.volumes && service.volumes !== "[]") {
      const volumeConfig = JSON.parse(service.volumes) as {
        name: string;
        path: string;
      }[];
      volumes = [];
      for (const v of volumeConfig) {
        const volumeName = buildVolumeName(service.id, v.name);
        await createVolume(volumeName);
        volumes.push({ name: volumeName, path: v.path });
      }
      await appendLog(deploymentId, `Created ${volumes.length} volume(s)\n`);
    }

    let fileMounts: FileMount[] | undefined;
    let command: string[] | undefined;
    const isPostgres = service.imageUrl?.includes("postgres") ?? false;
    if (service.serviceType === "database" && isPostgres) {
      if (!sslCertsExist(service.id)) {
        await generateSelfSignedCert(service.id);
        await appendLog(
          deploymentId,
          "Generated SSL certificate for database\n",
        );
      }
      const sslPaths = getSSLPaths(service.id);
      fileMounts = [
        {
          hostPath: sslPaths.cert,
          containerPath: "/etc/ssl/postgres/server.crt",
        },
        {
          hostPath: sslPaths.key,
          containerPath: "/etc/ssl/postgres/server.key",
        },
      ];
      command = [
        "postgres",
        "-c",
        "ssl=on",
        "-c",
        "ssl_cert_file=/etc/ssl/postgres/server.crt",
        "-c",
        "ssl_key_file=/etc/ssl/postgres/server.key",
      ];
      await appendLog(deploymentId, "SSL enabled for postgres\n");
    }

    await db
      .updateTable("deployments")
      .set({
        envVarsSnapshot: JSON.stringify(envVarsList),
        containerPort: service.containerPort,
        healthCheckPath: service.healthCheckPath,
        healthCheckTimeout: service.healthCheckTimeout,
        volumes: service.volumes,
      })
      .where("id", "=", deploymentId)
      .execute();

    if (await isDeploymentCancelled(deploymentId)) {
      return;
    }

    if (service.currentDeploymentId) {
      const oldContainerName = sanitizeDockerName(
        `frost-${service.id}-${service.currentDeploymentId}`,
      );
      await stopContainer(oldContainerName);
    }

    const gitInfo =
      service.deployType === "repo" && service.branch
        ? { commitSha: currentCommitSha, branch: service.branch }
        : undefined;
    const frostEnvVars = buildFrostEnvVars(
      deploymentId,
      service,
      project,
      gitInfo,
    );
    const runtimeEnvVars = { ...frostEnvVars, ...envVars };

    const { containerId, hostPort } = await runContainerWithPortRetry(
      {
        imageName,
        containerPort: service.containerPort ?? undefined,
        name: containerName,
        envVars: runtimeEnvVars,
        network: networkName,
        hostname: service.hostname ?? service.name,
        labels: {
          ...baseLabels,
          "frost.deployment.id": deploymentId,
        },
        volumes,
        fileMounts,
        command,
        memoryLimit: service.memoryLimit ?? undefined,
        cpuLimit: service.cpuLimit ?? undefined,
        shutdownTimeout: service.shutdownTimeout ?? undefined,
      },
      async (port, attempt) => {
        await appendLog(
          deploymentId,
          `Port ${port} conflict, retrying (attempt ${attempt}/${MAX_PORT_ATTEMPTS})...\n`,
        );
      },
    );

    await appendLog(
      deploymentId,
      `Container started: ${containerId.substring(0, 12)}\n`,
    );
    const healthCheckType = service.healthCheckPath
      ? `HTTP ${service.healthCheckPath}`
      : "TCP";
    await appendLog(
      deploymentId,
      `Health check (${healthCheckType}) on port ${hostPort}...\n`,
    );

    const isHealthy = await waitForHealthy({
      containerId,
      port: hostPort,
      path: service.healthCheckPath,
      timeoutSeconds: service.healthCheckTimeout ?? 60,
    });
    if (!isHealthy) {
      const containerStatus = await getContainerStatus(containerId);
      await appendLog(deploymentId, `Container status: ${containerStatus}\n`);
      try {
        const { stdout: logs } = await execAsync(
          `docker logs ${containerId} 2>&1 | tail -50`,
        );
        await appendLog(deploymentId, `Container logs:\n${logs}\n`);
      } catch {
        await appendLog(deploymentId, `Could not get container logs\n`);
      }
      throw new Error("Container failed health check");
    }

    await updateDeployment(deploymentId, {
      status: "running",
      containerId,
      hostPort,
      finishedAt: Date.now(),
    });

    await db
      .updateTable("services")
      .set({ currentDeploymentId: deploymentId })
      .where("id", "=", service.id)
      .execute();

    await appendLog(
      deploymentId,
      `\nDeployment successful! App available at http://localhost:${hostPort}\n`,
    );
    await updateCommitStatusIfGitHub(
      service.repoUrl,
      currentCommitSha,
      "success",
      "Deployed",
      deploymentId,
    );

    try {
      const synced = await syncCaddyConfig();
      if (synced) {
        await appendLog(deploymentId, "Caddy config synced\n");
      }
    } catch (err: any) {
      await appendLog(
        deploymentId,
        `Warning: Failed to sync Caddy config: ${err.message}\n`,
      );
    }

    await updateRollbackEligible(service.id);

    const previousDeployments = await db
      .selectFrom("deployments")
      .select(["id", "containerId"])
      .where("serviceId", "=", service.id)
      .where("id", "!=", deploymentId)
      .where("status", "=", "running")
      .execute();

    for (const prev of previousDeployments) {
      if (prev.containerId) {
        await stopContainer(prev.containerId);
      }
      await db
        .updateTable("deployments")
        .set({ status: "failed", finishedAt: Date.now() })
        .where("id", "=", prev.id)
        .execute();
    }
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    await updateDeployment(deploymentId, {
      status: "failed",
      errorMessage: errorMessage,
      finishedAt: Date.now(),
    });
    await appendLog(deploymentId, `\nError: ${errorMessage}\n`);
    await updateCommitStatusIfGitHub(
      service.repoUrl,
      currentCommitSha,
      "failure",
      "Deployment failed",
      deploymentId,
    );
  }
}

const ROLLBACK_ELIGIBLE_COUNT = 5;

async function updateRollbackEligible(serviceId: string): Promise<void> {
  const service = await db
    .selectFrom("services")
    .select("volumes")
    .where("id", "=", serviceId)
    .executeTakeFirst();

  const hasVolumes = service?.volumes && service.volumes !== "[]";
  if (hasVolumes) {
    return;
  }

  const successfulDeployments = await db
    .selectFrom("deployments")
    .select("id")
    .where("serviceId", "=", serviceId)
    .where("status", "=", "running")
    .where("imageName", "is not", null)
    .orderBy("createdAt", "desc")
    .execute();

  const eligibleIds = successfulDeployments
    .slice(0, ROLLBACK_ELIGIBLE_COUNT)
    .map((d) => d.id);
  const ineligibleIds = successfulDeployments
    .slice(ROLLBACK_ELIGIBLE_COUNT)
    .map((d) => d.id);

  if (eligibleIds.length > 0) {
    await db
      .updateTable("deployments")
      .set({ rollbackEligible: 1 })
      .where("id", "in", eligibleIds)
      .execute();
  }

  if (ineligibleIds.length > 0) {
    await db
      .updateTable("deployments")
      .set({ rollbackEligible: 0 })
      .where("id", "in", ineligibleIds)
      .execute();
  }
}

export async function rollbackDeployment(
  deploymentId: string,
): Promise<string> {
  const targetDeployment = await db
    .selectFrom("deployments")
    .selectAll()
    .where("id", "=", deploymentId)
    .executeTakeFirst();

  if (!targetDeployment) {
    throw new Error("Deployment not found");
  }

  if (!targetDeployment.imageName) {
    throw new Error("Deployment has no image snapshot");
  }

  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", targetDeployment.serviceId)
    .executeTakeFirst();

  if (!service) {
    throw new Error("Service not found");
  }

  if (service.volumes && service.volumes !== "[]") {
    throw new Error("Cannot rollback services with volumes");
  }

  const project = await db
    .selectFrom("projects")
    .selectAll()
    .where("id", "=", targetDeployment.projectId)
    .executeTakeFirst();

  if (!project) {
    throw new Error("Project not found");
  }

  const exists = await imageExists(targetDeployment.imageName);
  if (!exists) {
    throw new Error("Image no longer available");
  }

  const inProgressStatuses = [
    "pending",
    "cloning",
    "pulling",
    "building",
    "deploying",
  ];
  const activeDeployments = await db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("serviceId", "=", service.id)
    .where("id", "!=", deploymentId)
    .where("status", "in", inProgressStatuses)
    .execute();

  for (const dep of activeDeployments) {
    if (dep.containerId) {
      await stopContainer(dep.containerId);
    }
    await db
      .updateTable("deployments")
      .set({ status: "cancelled", finishedAt: Date.now() })
      .where("id", "=", dep.id)
      .execute();
  }

  await updateDeployment(deploymentId, { status: "deploying" });

  runRollbackDeployment(deploymentId, targetDeployment, service, project).catch(
    (err) => {
      console.error("Rollback deployment failed:", err);
    },
  );

  return deploymentId;
}

async function runRollbackDeployment(
  deploymentId: string,
  sourceDeployment: {
    imageName: string | null;
    envVarsSnapshot: string | null;
    containerPort: number | null;
    healthCheckPath: string | null;
    healthCheckTimeout: number | null;
    gitCommitSha: string | null;
    gitBranch: string | null;
  },
  service: Selectable<Services>,
  project: Selectable<Projects>,
) {
  const containerName = sanitizeDockerName(
    `frost-${service.id}-${deploymentId}`,
  );
  const networkName = sanitizeDockerName(`frost-net-${project.id}`);

  const baseLabels = {
    "frost.managed": "true",
    "frost.project.id": project.id,
    "frost.service.id": service.id,
    "frost.service.name": service.name,
  };

  const envVarsList: EnvVar[] = sourceDeployment.envVarsSnapshot
    ? JSON.parse(sourceDeployment.envVarsSnapshot)
    : [];
  const envVars: Record<string, string> = {};
  for (const e of envVarsList) {
    envVars[e.key] = e.value;
  }

  try {
    await updateDeployment(deploymentId, { status: "deploying" });
    await appendLog(
      deploymentId,
      `Rolling back to image ${sourceDeployment.imageName}...\n`,
    );

    await createNetwork(networkName, baseLabels);

    if (service.currentDeploymentId) {
      const oldContainerName = sanitizeDockerName(
        `frost-${service.id}-${service.currentDeploymentId}`,
      );
      await stopContainer(oldContainerName);
    }

    const gitInfo =
      sourceDeployment.gitCommitSha && sourceDeployment.gitBranch
        ? {
            commitSha: sourceDeployment.gitCommitSha,
            branch: sourceDeployment.gitBranch,
          }
        : undefined;
    const frostEnvVars = buildFrostEnvVars(
      deploymentId,
      service,
      project,
      gitInfo,
    );
    const runtimeEnvVars = { ...frostEnvVars, ...envVars };

    if (!sourceDeployment.imageName) {
      throw new Error("Source deployment has no image");
    }

    const { containerId, hostPort } = await runContainerWithPortRetry(
      {
        imageName: sourceDeployment.imageName,
        containerPort: sourceDeployment.containerPort ?? undefined,
        name: containerName,
        envVars: runtimeEnvVars,
        network: networkName,
        hostname: service.hostname ?? service.name,
        labels: {
          ...baseLabels,
          "frost.deployment.id": deploymentId,
        },
        memoryLimit: service.memoryLimit ?? undefined,
        cpuLimit: service.cpuLimit ?? undefined,
        shutdownTimeout: service.shutdownTimeout ?? undefined,
      },
      async (port, attempt) => {
        await appendLog(
          deploymentId,
          `Port ${port} conflict, retrying (attempt ${attempt}/${MAX_PORT_ATTEMPTS})...\n`,
        );
      },
    );

    await appendLog(
      deploymentId,
      `Container started: ${containerId.substring(0, 12)}\n`,
    );

    const healthCheckType = sourceDeployment.healthCheckPath
      ? `HTTP ${sourceDeployment.healthCheckPath}`
      : "TCP";
    await appendLog(
      deploymentId,
      `Health check (${healthCheckType}) on port ${hostPort}...\n`,
    );

    const isHealthy = await waitForHealthy({
      containerId,
      port: hostPort,
      path: sourceDeployment.healthCheckPath,
      timeoutSeconds: sourceDeployment.healthCheckTimeout ?? 60,
    });

    if (!isHealthy) {
      const containerStatus = await getContainerStatus(containerId);
      await appendLog(deploymentId, `Container status: ${containerStatus}\n`);
      try {
        const { stdout: logs } = await execAsync(
          `docker logs ${containerId} 2>&1 | tail -50`,
        );
        await appendLog(deploymentId, `Container logs:\n${logs}\n`);
      } catch {
        await appendLog(deploymentId, `Could not get container logs\n`);
      }
      throw new Error("Container failed health check");
    }

    await updateDeployment(deploymentId, {
      status: "running",
      containerId,
      hostPort,
      finishedAt: Date.now(),
    });

    await db
      .updateTable("services")
      .set({ currentDeploymentId: deploymentId })
      .where("id", "=", service.id)
      .execute();

    await appendLog(
      deploymentId,
      `\nRollback successful! App available at http://localhost:${hostPort}\n`,
    );

    try {
      const synced = await syncCaddyConfig();
      if (synced) {
        await appendLog(deploymentId, "Caddy config synced\n");
      }
    } catch (err: any) {
      await appendLog(
        deploymentId,
        `Warning: Failed to sync Caddy config: ${err.message}\n`,
      );
    }

    await updateRollbackEligible(service.id);

    const previousDeployments = await db
      .selectFrom("deployments")
      .select(["id", "containerId"])
      .where("serviceId", "=", service.id)
      .where("id", "!=", deploymentId)
      .where("status", "=", "running")
      .execute();

    for (const prev of previousDeployments) {
      if (prev.containerId) {
        await stopContainer(prev.containerId);
      }
      await db
        .updateTable("deployments")
        .set({ status: "failed", finishedAt: Date.now() })
        .where("id", "=", prev.id)
        .execute();
    }
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    await updateDeployment(deploymentId, {
      status: "failed",
      errorMessage: errorMessage,
      finishedAt: Date.now(),
    });
    await appendLog(deploymentId, `\nError: ${errorMessage}\n`);
  }
}
