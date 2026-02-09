import { exec, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Selectable } from "kysely";
import { nanoid } from "nanoid";
import { getSetting } from "./auth";
import { emitBuildLogChunk } from "./build-log-stream";
import { decrypt } from "./crypto";
import { db } from "./db";
import type { Environments, Projects, Registries, Services } from "./db-types";
import {
  type BuildResult,
  buildImage,
  createNetwork,
  dockerLogin,
  type FileMount,
  getAvailablePort,
  getContainerStatus,
  getRegistryUrl,
  gracefulStopContainer,
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
import { loadFrostConfig, mergeConfigWithService } from "./frost-config";
import {
  createCommitStatus,
  generateInstallationToken,
  hasGitHubApp,
  injectTokenIntoUrl,
  isGitHubRepo,
} from "./github";
import { detectIcon, detectIconFromImage } from "./icon-detector";
import { shellEscape } from "./shell-escape";
import { slugify } from "./slugify";
import { generateSelfSignedCert, getSSLPaths, sslCertsExist } from "./ssl";
import type { EnvVar } from "./types";
import { buildVolumeName, createVolume } from "./volumes";
import { updateEnvironmentPRComment } from "./webhook";

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
  | "stopped"
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

async function appendLog(
  id: string,
  log: string,
  options?: { emit?: boolean },
) {
  if (!log) return;
  const deployment = await db
    .selectFrom("deployments")
    .select("buildLog")
    .where("id", "=", id)
    .executeTakeFirst();

  const existingLog = deployment?.buildLog || "";
  await updateDeployment(id, { buildLog: existingLog + log });
  if (options?.emit !== false) {
    emitBuildLogChunk(id, log);
  }
}

function createLogChunkAppender(deploymentId: string): {
  append: (chunk: string) => void;
  flush: () => Promise<void>;
} {
  let queue = Promise.resolve();
  let queueError: Error | null = null;

  function append(chunk: string): void {
    if (!chunk || queueError) return;
    emitBuildLogChunk(deploymentId, chunk);
    queue = queue
      .then(function writeChunk() {
        return appendLog(deploymentId, chunk, { emit: false });
      })
      .catch(function onQueueError(err) {
        queueError =
          err instanceof Error
            ? err
            : new Error(String(err ?? "Unknown error"));
      });
  }

  async function flush(): Promise<void> {
    await queue;
    if (queueError) {
      throw queueError;
    }
  }

  return { append, flush };
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
  return Object.fromEntries(envVarsList.map((e) => [e.key, e.value]));
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

async function cancelActiveDeployments(
  serviceId: string,
  excludeDeploymentId?: string,
): Promise<void> {
  const inProgressStatuses = [
    "pending",
    "cloning",
    "pulling",
    "building",
    "deploying",
  ] as const;

  let query = db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("serviceId", "=", serviceId)
    .where("status", "in", [...inProgressStatuses]);

  if (excludeDeploymentId) {
    query = query.where("id", "!=", excludeDeploymentId);
  }

  const activeDeployments = await query.execute();

  for (const dep of activeDeployments) {
    if (dep.containerId) {
      await stopContainer(dep.containerId);
    }
    const depReplicas = await db
      .selectFrom("replicas")
      .select("containerId")
      .where("deploymentId", "=", dep.id)
      .where("containerId", "is not", null)
      .execute();
    for (const r of depReplicas) {
      if (r.containerId) await stopContainer(r.containerId);
    }
    await db
      .updateTable("deployments")
      .set({ status: "cancelled", finishedAt: Date.now() })
      .where("id", "=", dep.id)
      .execute();
  }
}

interface StartedReplica {
  id: string;
  containerId: string;
  hostPort: number;
  index: number;
}

interface StartReplicasOptions {
  deploymentId: string;
  replicaCount: number;
  containerName: string;
  imageName: string;
  containerPort?: number;
  runtimeEnvVars: Record<string, string>;
  networkName: string;
  internalHostname: string;
  baseLabels: Record<string, string>;
  volumes?: VolumeMount[];
  fileMounts?: FileMount[];
  command?: string[];
  memoryLimit?: string;
  cpuLimit?: number;
  shutdownTimeout?: number;
}

async function startReplicas(
  opts: StartReplicasOptions,
): Promise<StartedReplica[]> {
  await db
    .deleteFrom("replicas")
    .where("deploymentId", "=", opts.deploymentId)
    .execute();

  for (let i = 0; i < opts.replicaCount; i++) {
    await db
      .insertInto("replicas")
      .values({
        id: nanoid(),
        deploymentId: opts.deploymentId,
        replicaIndex: i,
        containerId: null,
        hostPort: null,
        status: "pending",
      })
      .execute();
  }

  const replicaRows = await db
    .selectFrom("replicas")
    .selectAll()
    .where("deploymentId", "=", opts.deploymentId)
    .orderBy("replicaIndex", "asc")
    .execute();

  const startedReplicas: StartedReplica[] = [];

  try {
    for (const replica of replicaRows) {
      const replicaContainerName =
        opts.replicaCount > 1
          ? sanitizeDockerName(`${opts.containerName}-${replica.replicaIndex}`)
          : opts.containerName;

      const replicaEnvVars =
        opts.replicaCount > 1
          ? {
              ...opts.runtimeEnvVars,
              FROST_REPLICA_INDEX: String(replica.replicaIndex),
            }
          : opts.runtimeEnvVars;

      const { containerId: cId, hostPort: hPort } =
        await runContainerWithPortRetry(
          {
            imageName: opts.imageName,
            containerPort: opts.containerPort,
            name: replicaContainerName,
            envVars: replicaEnvVars,
            network: opts.networkName,
            hostname: opts.internalHostname,
            networkAlias: `${opts.internalHostname}.frost.internal`,
            labels: {
              ...opts.baseLabels,
              "frost.deployment.id": opts.deploymentId,
              "frost.replica.index": String(replica.replicaIndex),
            },
            volumes: opts.volumes,
            fileMounts: opts.fileMounts,
            command: opts.command,
            memoryLimit: opts.memoryLimit,
            cpuLimit: opts.cpuLimit,
            shutdownTimeout: opts.shutdownTimeout,
          },
          async (port, attempt) => {
            await appendLog(
              opts.deploymentId,
              `Port ${port} conflict, retrying (attempt ${attempt}/${MAX_PORT_ATTEMPTS})...\n`,
            );
          },
        );

      startedReplicas.push({
        id: replica.id,
        containerId: cId,
        hostPort: hPort,
        index: replica.replicaIndex,
      });

      await db
        .updateTable("replicas")
        .set({ containerId: cId, hostPort: hPort, status: "running" })
        .where("id", "=", replica.id)
        .execute();

      if (opts.replicaCount > 1) {
        await appendLog(
          opts.deploymentId,
          `Replica ${replica.replicaIndex} started: ${cId.substring(0, 12)} on port ${hPort}\n`,
        );
      } else {
        await appendLog(
          opts.deploymentId,
          `Container started: ${cId.substring(0, 12)}\n`,
        );
      }
    }
  } catch (err) {
    for (const r of startedReplicas) {
      await stopContainer(r.containerId);
      await db
        .updateTable("replicas")
        .set({ status: "failed" })
        .where("id", "=", r.id)
        .execute();
    }
    throw err;
  }

  return startedReplicas;
}

async function healthCheckReplicas(
  deploymentId: string,
  replicas: StartedReplica[],
  replicaCount: number,
  healthCheckPath: string | null,
  healthCheckTimeout: number | null,
): Promise<void> {
  const healthCheckType = healthCheckPath ? `HTTP ${healthCheckPath}` : "TCP";

  if (replicaCount > 1) {
    await appendLog(
      deploymentId,
      `Health check (${healthCheckType}) on ${replicaCount} replicas...\n`,
    );
  } else {
    await appendLog(
      deploymentId,
      `Health check (${healthCheckType}) on port ${replicas[0].hostPort}...\n`,
    );
  }

  const healthResults = await Promise.all(
    replicas.map(async (r) => {
      const isHealthy = await waitForHealthy({
        containerId: r.containerId,
        port: r.hostPort,
        path: healthCheckPath,
        timeoutSeconds: healthCheckTimeout ?? 60,
      });
      return { ...r, isHealthy };
    }),
  );

  const failedReplicas = healthResults.filter((r) => !r.isHealthy);
  if (failedReplicas.length > 0) {
    for (const failed of failedReplicas) {
      const containerStatus = await getContainerStatus(failed.containerId);
      await appendLog(
        deploymentId,
        `Replica ${failed.index} status: ${containerStatus}\n`,
      );
      try {
        const { stdout: logs } = await execAsync(
          `docker logs ${shellEscape(failed.containerId)} 2>&1 | tail -50`,
        );
        await appendLog(
          deploymentId,
          `Replica ${failed.index} logs:\n${logs}\n`,
        );
      } catch {
        await appendLog(
          deploymentId,
          `Could not get logs for replica ${failed.index}\n`,
        );
      }
    }
    throw new Error(
      `${failedReplicas.length}/${replicaCount} replica(s) failed health check`,
    );
  }
}

async function drainPreviousDeployments(
  deploymentId: string,
  serviceId: string,
  drainTimeout: number,
  shutdownTimeout: number,
): Promise<void> {
  const isContainerLive = (status: string) =>
    status === "running" || status === "restarting" || status === "paused";

  const stopOldContainer = async (containerId: string) => {
    await gracefulStopContainer(containerId, shutdownTimeout);
    let status = await getContainerStatus(containerId);

    if (isContainerLive(status)) {
      await appendLog(
        deploymentId,
        `Graceful stop did not fully stop old container ${containerId.substring(0, 12)} (status=${status}); forcing stop...\n`,
      );
      await stopContainer(containerId);
      status = await getContainerStatus(containerId);
    }

    if (isContainerLive(status)) {
      throw new Error(
        `Failed to stop old container ${containerId.substring(0, 12)} (status=${status})`,
      );
    }
  };

  const previousDeployments = await db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("serviceId", "=", serviceId)
    .where("id", "!=", deploymentId)
    .where("status", "=", "running")
    .execute();

  if (previousDeployments.length === 0) return;

  if (await isDeploymentCancelled(deploymentId)) return;

  if (drainTimeout > 0) {
    await appendLog(
      deploymentId,
      `Draining old container (${drainTimeout}s)...\n`,
    );
    await new Promise((r) => setTimeout(r, drainTimeout * 1000));
  }

  if (await isDeploymentCancelled(deploymentId)) return;

  await appendLog(
    deploymentId,
    `Stopping old container (SIGTERM, ${shutdownTimeout}s timeout)...\n`,
  );

  for (const prev of previousDeployments) {
    const oldReplicas = await db
      .selectFrom("replicas")
      .select("containerId")
      .where("deploymentId", "=", prev.id)
      .where("containerId", "is not", null)
      .execute();

    if (oldReplicas.length > 0) {
      for (const r of oldReplicas) {
        if (r.containerId) {
          await stopOldContainer(r.containerId);
        }
      }
      await db
        .updateTable("replicas")
        .set({ status: "stopped" })
        .where("deploymentId", "=", prev.id)
        .execute();
    } else if (prev.containerId) {
      await stopOldContainer(prev.containerId);
    }
    await db
      .updateTable("deployments")
      .set({ status: "stopped", finishedAt: Date.now() })
      .where("id", "=", prev.id)
      .execute();
  }
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
    const frostDomain = await getSetting("domain");
    let targetUrl: string | undefined;

    if (frostDomain) {
      const deployment = await db
        .selectFrom("deployments")
        .innerJoin(
          "environments",
          "environments.id",
          "deployments.environmentId",
        )
        .select([
          "deployments.serviceId",
          "deployments.environmentId",
          "environments.projectId",
        ])
        .where("deployments.id", "=", deploymentId)
        .executeTakeFirst();

      if (deployment) {
        targetUrl = `https://${frostDomain}/projects/${deployment.projectId}/environments/${deployment.environmentId}?service=${deployment.serviceId}`;
      }
    }

    await createCommitStatus({
      repoUrl,
      commitSha,
      state,
      description,
      targetUrl,
    });
  } catch (err) {
    console.warn("Failed to update commit status:", err);
  }
}

export type DeployTrigger = "manual" | "git" | "rollback";

export interface TriggeredBy {
  username: string;
  avatarUrl?: string;
}

export interface DeployOptions {
  commitSha?: string;
  commitMessage?: string;
  trigger?: DeployTrigger;
  triggeredBy?: TriggeredBy;
}

export async function deployEnvironment(
  environmentId: string,
): Promise<string[]> {
  const services = await db
    .selectFrom("services")
    .select("id")
    .where("environmentId", "=", environmentId)
    .execute();

  if (services.length === 0) {
    throw new Error("No services to deploy");
  }

  return Promise.all(services.map((s) => deployService(s.id)));
}

export async function deployProject(projectId: string): Promise<string[]> {
  const environments = await db
    .selectFrom("environments")
    .select("id")
    .where("projectId", "=", projectId)
    .execute();

  if (environments.length === 0) {
    throw new Error("No environments found");
  }

  const results = await Promise.all(
    environments.map((env) => deployEnvironment(env.id)),
  );
  return results.flat();
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

  const environment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", service.environmentId)
    .executeTakeFirst();

  if (!environment) {
    throw new Error("Environment not found");
  }

  const project = await db
    .selectFrom("projects")
    .selectAll()
    .where("id", "=", environment.projectId)
    .executeTakeFirst();

  if (!project) {
    throw new Error("Project not found");
  }

  await cancelActiveDeployments(serviceId);

  const deploymentId = nanoid();
  const now = Date.now();

  await db
    .insertInto("deployments")
    .values({
      id: deploymentId,
      environmentId: environment.id,
      serviceId: serviceId,
      commitSha: options?.commitSha?.substring(0, 7) || "HEAD",
      commitMessage: options?.commitMessage || null,
      status: "pending",
      createdAt: now,
      trigger: options?.trigger || "manual",
      triggeredByUsername: options?.triggeredBy?.username || null,
      triggeredByAvatarUrl: options?.triggeredBy?.avatarUrl || null,
    })
    .execute();

  runServiceDeployment(
    deploymentId,
    service,
    environment,
    project,
    options,
  ).catch((err) => {
    console.error("Deployment failed:", err);
  });

  return deploymentId;
}

async function runServiceDeployment(
  deploymentId: string,
  service: Selectable<Services>,
  environment: Selectable<Environments>,
  project: Selectable<Projects>,
  options?: DeployOptions,
) {
  let currentCommitSha = options?.commitSha || "HEAD";
  const containerName = sanitizeDockerName(
    `frost-${service.id}-${deploymentId}`,
  );
  const networkName = sanitizeDockerName(
    `frost-net-${project.id}-${environment.id}`,
  );

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
    let effectiveService = service;

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
        const failureClass = pullResult.failureClass || "unknown";
        const attemptCount = pullResult.attempts || 1;
        const failureType = failureClass.startsWith("infra/")
          ? "transient infrastructure issue"
          : "deterministic pull failure";

        await appendLog(
          deploymentId,
          `Image pull failed after ${attemptCount} attempt(s). class=${failureClass} (${failureType})\n`,
        );

        throw new Error(
          pullResult.error
            ? `${pullResult.error} [class=${failureClass}]`
            : `Pull failed [class=${failureClass}]`,
        );
      }

      if (await isDeploymentCancelled(deploymentId)) {
        return;
      }

      await db
        .updateTable("deployments")
        .set({ commitSha: imageTag })
        .where("id", "=", deploymentId)
        .execute();

      const detectedIcon = detectIconFromImage(service.imageUrl);
      if (detectedIcon && !service.icon) {
        await db
          .updateTable("services")
          .set({ icon: detectedIcon })
          .where("id", "=", service.id)
          .execute();
      }
    } else {
      if (!service.repoUrl || !service.branch || !service.dockerfilePath) {
        throw new Error("Repo URL, branch, and Dockerfile path are required");
      }

      const branch = service.branch;
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

      const cloneLogAppender = createLogChunkAppender(deploymentId);
      let cloneResult: { output: string; code: number | null } | null = null;
      try {
        cloneResult = await new Promise<{
          output: string;
          code: number | null;
        }>((resolve, reject) => {
          let output = "";
          const proc = spawn("git", [
            "clone",
            "--depth",
            "1",
            "--branch",
            branch,
            cloneUrl,
            repoPath,
          ]);
          proc.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            cloneLogAppender.append(chunk);
          });
          proc.stderr.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            cloneLogAppender.append(chunk);
          });
          proc.on("close", (code) => {
            resolve({ output, code });
          });
          proc.on("error", reject);
        });
      } finally {
        await cloneLogAppender.flush();
      }

      if (!cloneResult) {
        throw new Error("git clone failed");
      }

      if (!cloneResult.output) {
        await appendLog(deploymentId, "Cloned successfully\n");
      }
      if (cloneResult.code !== 0) {
        throw new Error(
          cloneResult.output ||
            `git clone exited with code ${cloneResult.code}`,
        );
      }

      const frostConfigResult = loadFrostConfig(
        repoPath,
        service.frostFilePath ?? "frost.yaml",
      );

      if (frostConfigResult.error) {
        throw new Error(`frost.yaml: ${frostConfigResult.error}`);
      }

      if (frostConfigResult.config) {
        await appendLog(deploymentId, `Using ${frostConfigResult.filename}\n`);
        effectiveService = mergeConfigWithService(
          service,
          frostConfigResult.config,
        );
      }

      const detectedIcon = detectIcon(
        repoPath,
        effectiveService.dockerfilePath ?? undefined,
      );
      if (detectedIcon && !service.icon) {
        await db
          .updateTable("services")
          .set({ icon: detectedIcon })
          .where("id", "=", service.id)
          .execute();
      }

      const { stdout: commitResult } = await execAsync(
        `git -C ${shellEscape(repoPath)} rev-parse HEAD`,
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
      const buildLogAppender = createLogChunkAppender(deploymentId);
      let buildResult: BuildResult | null = null;
      try {
        buildResult = await buildImage({
          repoPath,
          imageName,
          dockerfilePath: effectiveService.dockerfilePath ?? undefined,
          buildContext: service.buildContext ?? undefined,
          envVars,
          labels: baseLabels,
          onData(chunk) {
            buildLogAppender.append(chunk);
          },
        });
      } finally {
        await buildLogAppender.flush();
      }

      if (!buildResult || !buildResult.success) {
        throw new Error(buildResult?.error || "Build failed");
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

    if (service.command) {
      command = ["sh", "-c", service.command];
    }

    const isPostgres = service.imageUrl?.includes("postgres") ?? false;
    if (service.serviceType === "database" && isPostgres && !service.command) {
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
        containerPort: effectiveService.containerPort,
        healthCheckPath: effectiveService.healthCheckPath,
        healthCheckTimeout: effectiveService.healthCheckTimeout,
        volumes: service.volumes,
      })
      .where("id", "=", deploymentId)
      .execute();

    if (await isDeploymentCancelled(deploymentId)) {
      return;
    }

    if (service.currentDeploymentId) {
      await appendLog(
        deploymentId,
        "Starting new container (zero-downtime)...\n",
      );
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

    const internalHostname = service.hostname ?? slugify(service.name);
    const replicaCount = effectiveService.replicaCount ?? 1;

    const startedReplicas = await startReplicas({
      deploymentId,
      replicaCount,
      containerName,
      imageName,
      containerPort: effectiveService.containerPort ?? undefined,
      runtimeEnvVars,
      networkName,
      internalHostname,
      baseLabels,
      volumes,
      fileMounts,
      command,
      memoryLimit: effectiveService.memoryLimit ?? undefined,
      cpuLimit: effectiveService.cpuLimit ?? undefined,
      shutdownTimeout: service.shutdownTimeout ?? undefined,
    });

    await healthCheckReplicas(
      deploymentId,
      startedReplicas,
      replicaCount,
      effectiveService.healthCheckPath,
      effectiveService.healthCheckTimeout,
    );

    const firstReplica = startedReplicas[0];
    await updateDeployment(deploymentId, {
      status: "running",
      containerId: firstReplica.containerId,
      hostPort: firstReplica.hostPort,
      finishedAt: Date.now(),
    });

    await db
      .updateTable("services")
      .set({ currentDeploymentId: deploymentId })
      .where("id", "=", service.id)
      .execute();

    await appendLog(
      deploymentId,
      `\nDeployment successful! App available at http://localhost:${firstReplica.hostPort}\n`,
    );
    await updateCommitStatusIfGitHub(
      service.repoUrl,
      currentCommitSha,
      "success",
      "Deployed",
      deploymentId,
    );

    try {
      await updateEnvironmentPRComment(environment.id, service.repoUrl);
    } catch (err) {
      console.warn("Failed to update PR comment:", err);
    }

    await updateRollbackEligible(service.id);

    try {
      await appendLog(deploymentId, "Switching traffic to new container...\n");
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

    await drainPreviousDeployments(
      deploymentId,
      service.id,
      effectiveService.drainTimeout ?? 30,
      effectiveService.shutdownTimeout ?? 30,
    );
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    await updateDeployment(deploymentId, {
      status: "failed",
      errorMessage,
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

    try {
      await updateEnvironmentPRComment(environment.id, service.repoUrl);
    } catch (err) {
      console.warn("Failed to update PR comment:", err);
    }
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
      .set({ rollbackEligible: true })
      .where("id", "in", eligibleIds)
      .execute();
  }

  if (ineligibleIds.length > 0) {
    await db
      .updateTable("deployments")
      .set({ rollbackEligible: false })
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

  const environment = await db
    .selectFrom("environments")
    .selectAll()
    .where("id", "=", targetDeployment.environmentId)
    .executeTakeFirst();

  if (!environment) {
    throw new Error("Environment not found");
  }

  const project = await db
    .selectFrom("projects")
    .selectAll()
    .where("id", "=", environment.projectId)
    .executeTakeFirst();

  if (!project) {
    throw new Error("Project not found");
  }

  const exists = await imageExists(targetDeployment.imageName);
  if (!exists) {
    throw new Error("Image no longer available");
  }

  await cancelActiveDeployments(service.id, deploymentId);

  await db
    .updateTable("deployments")
    .set({ status: "deploying", trigger: "rollback" })
    .where("id", "=", deploymentId)
    .execute();

  runRollbackDeployment(
    deploymentId,
    targetDeployment,
    service,
    environment,
    project,
  ).catch((err) => {
    console.error("Rollback deployment failed:", err);
  });

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
  environment: Selectable<Environments>,
  project: Selectable<Projects>,
) {
  const containerName = sanitizeDockerName(
    `frost-${service.id}-${deploymentId}`,
  );
  const networkName = sanitizeDockerName(
    `frost-net-${project.id}-${environment.id}`,
  );

  const baseLabels = {
    "frost.managed": "true",
    "frost.project.id": project.id,
    "frost.service.id": service.id,
    "frost.service.name": service.name,
  };

  const envVarsList: EnvVar[] = sourceDeployment.envVarsSnapshot
    ? JSON.parse(sourceDeployment.envVarsSnapshot)
    : [];
  const envVars = Object.fromEntries(envVarsList.map((e) => [e.key, e.value]));

  try {
    await appendLog(
      deploymentId,
      `Rolling back to image ${sourceDeployment.imageName}...\n`,
    );

    await createNetwork(networkName, baseLabels);

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

    const internalHostname = service.hostname ?? slugify(service.name);
    const replicaCount = service.replicaCount ?? 1;

    const startedReplicas = await startReplicas({
      deploymentId,
      replicaCount,
      containerName,
      imageName: sourceDeployment.imageName,
      containerPort: sourceDeployment.containerPort ?? undefined,
      runtimeEnvVars,
      networkName,
      internalHostname,
      baseLabels,
      memoryLimit: service.memoryLimit ?? undefined,
      cpuLimit: service.cpuLimit ?? undefined,
      shutdownTimeout: service.shutdownTimeout ?? undefined,
    });

    await healthCheckReplicas(
      deploymentId,
      startedReplicas,
      replicaCount,
      sourceDeployment.healthCheckPath,
      sourceDeployment.healthCheckTimeout,
    );

    const firstReplica = startedReplicas[0];
    await updateDeployment(deploymentId, {
      status: "running",
      containerId: firstReplica.containerId,
      hostPort: firstReplica.hostPort,
      finishedAt: Date.now(),
    });

    await db
      .updateTable("services")
      .set({ currentDeploymentId: deploymentId })
      .where("id", "=", service.id)
      .execute();

    await appendLog(
      deploymentId,
      `\nRollback successful! App available at http://localhost:${firstReplica.hostPort}\n`,
    );

    await updateRollbackEligible(service.id);

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

    await drainPreviousDeployments(
      deploymentId,
      service.id,
      service.drainTimeout ?? 30,
      service.shutdownTimeout ?? 30,
    );
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    await updateDeployment(deploymentId, {
      status: "failed",
      errorMessage,
      finishedAt: Date.now(),
    });
    await appendLog(deploymentId, `\nError: ${errorMessage}\n`);
  }
}
