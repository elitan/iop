import { exec } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Selectable } from "kysely";
import { nanoid } from "nanoid";
import { db } from "./db";
import type { Project, Service } from "./db-types";
import {
  buildImage,
  createNetwork,
  getAvailablePort,
  pullImage,
  runContainer,
  stopContainer,
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
import type { EnvVar } from "./types";

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
  | "failed";

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

function parseEnvVars(envVarsJson: string): Record<string, string> {
  const envVarsList: EnvVar[] = envVarsJson ? JSON.parse(envVarsJson) : [];
  const envVars: Record<string, string> = {};
  for (const e of envVarsList) {
    envVars[e.key] = e.value;
  }
  return envVars;
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
  service: Selectable<Service>,
  project: Selectable<Project>,
  options?: DeployOptions,
) {
  let currentCommitSha = options?.commitSha || "HEAD";
  const containerName = `frost-${project.id}-${service.name}`.toLowerCase();
  const networkName = `frost-net-${project.id}`.toLowerCase();

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
      await appendLog(deploymentId, `Pulling image ${imageName}...\n`);

      const pullResult = await pullImage(imageName);
      await appendLog(deploymentId, pullResult.log);

      if (!pullResult.success) {
        throw new Error(pullResult.error || "Pull failed");
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

      const repoPath = join(REPOS_PATH, service.id);

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
        .set({ commitSha: commitSha })
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

      imageName =
        `frost-${project.id}-${service.name}:${commitSha}`.toLowerCase();
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
    }

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

    const hostPort = await getAvailablePort();
    const runResult = await runContainer({
      imageName,
      hostPort,
      containerPort: service.containerPort ?? undefined,
      name: containerName,
      envVars,
      network: networkName,
      hostname: service.name,
      labels: {
        ...baseLabels,
        "frost.deployment.id": deploymentId,
      },
    });

    if (!runResult.success) {
      throw new Error(runResult.error || "Failed to start container");
    }

    await appendLog(
      deploymentId,
      `Container started: ${runResult.containerId.substring(0, 12)}\n`,
    );
    const healthCheckType = service.healthCheckPath
      ? `HTTP ${service.healthCheckPath}`
      : "TCP";
    await appendLog(
      deploymentId,
      `Health check (${healthCheckType}) on port ${hostPort}...\n`,
    );

    const isHealthy = await waitForHealthy({
      containerId: runResult.containerId,
      port: hostPort,
      path: service.healthCheckPath,
      timeoutSeconds: service.healthCheckTimeout ?? 60,
    });
    if (!isHealthy) {
      throw new Error("Container failed health check");
    }

    await updateDeployment(deploymentId, {
      status: "running",
      containerId: runResult.containerId,
      hostPort: hostPort,
      finishedAt: Date.now(),
    });

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
      await syncCaddyConfig();
      await appendLog(deploymentId, "Caddy config synced\n");
    } catch (err: any) {
      await appendLog(
        deploymentId,
        `Warning: Failed to sync Caddy config: ${err.message}\n`,
      );
    }

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
