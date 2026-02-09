import { exec, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { join, relative } from "node:path";
import { promisify } from "node:util";

import { db } from "./db";
import { buildDockerRunArgs, shellEscape } from "./shell-escape";

const execAsync = promisify(exec);

export interface BuildResult {
  success: boolean;
  imageName: string;
  log: string;
  error?: string;
  failureClass?: string;
  attempts?: number;
}

export interface RunResult {
  success: boolean;
  containerId: string;
  error?: string;
}

export interface BuildImageOptions {
  repoPath: string;
  imageName: string;
  dockerfilePath?: string;
  buildContext?: string;
  envVars?: Record<string, string>;
  labels?: Record<string, string>;
  onData?: (chunk: string) => void;
}

export async function buildImage(
  optionsOrRepoPath: BuildImageOptions | string,
  imageNameArg?: string,
  dockerfilePathArg: string = "Dockerfile",
  envVarsArg?: Record<string, string>,
): Promise<BuildResult> {
  const options: BuildImageOptions =
    typeof optionsOrRepoPath === "string"
      ? {
          repoPath: optionsOrRepoPath,
          imageName: imageNameArg!,
          dockerfilePath: dockerfilePathArg,
          envVars: envVarsArg,
        }
      : optionsOrRepoPath;

  const {
    repoPath,
    imageName,
    dockerfilePath = "Dockerfile",
    buildContext,
    envVars,
    labels,
    onData,
  } = options;

  if (await imageExists(imageName)) {
    await removeImage(imageName);
  }

  return new Promise((resolve) => {
    let log = "";
    const contextPath = buildContext ? join(repoPath, buildContext) : repoPath;
    const resolvedDockerfile = buildContext
      ? relative(contextPath, join(repoPath, dockerfilePath))
      : dockerfilePath;
    const args = ["build", "-t", imageName, "-f", resolvedDockerfile];
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        args.push("--build-arg", `${key}=${value}`);
      }
    }
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        args.push("--label", `${key}=${value}`);
      }
    }
    args.push(".");
    const proc = spawn("docker", args, {
      cwd: contextPath,
    });

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      log += chunk;
      onData?.(chunk);
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      log += chunk;
      onData?.(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, imageName, log });
      } else {
        resolve({
          success: false,
          imageName,
          log,
          error: `Build exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, imageName, log, error: err.message });
    });
  });
}

export async function pullImage(imageName: string): Promise<BuildResult> {
  const retryCount = parseEnvInt("FROST_IMAGE_PULL_RETRIES", 3, 1);
  const backoffMs = parseEnvInt("FROST_IMAGE_PULL_BACKOFF_MS", 2000, 0);
  const maxBackoffMs = parseEnvInt(
    "FROST_IMAGE_PULL_MAX_BACKOFF_MS",
    10000,
    backoffMs,
  );

  let combinedLog = "";
  let lastError = "Pull failed";
  let lastFailureClass = "unknown";

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    combinedLog += `\n[pull-attempt ${attempt}/${retryCount}] docker pull ${imageName}\n`;
    const attemptResult = await runDockerPull(imageName);
    const failureClass = classifyPullFailure(
      attemptResult.log,
      attemptResult.error,
    );

    combinedLog += attemptResult.log;

    if (attemptResult.success) {
      return {
        success: true,
        imageName,
        log: combinedLog,
        attempts: attempt,
      };
    }

    lastError =
      attemptResult.error || `Pull exited with code ${attemptResult.code}`;
    lastFailureClass = failureClass;
    combinedLog += `[pull-attempt ${attempt}/${retryCount}] failed class=${failureClass} error=${lastError}\n`;

    const retryable =
      failureClass === "infra/transient-network" ||
      failureClass === "infra/rate-limit" ||
      failureClass === "unknown";

    if (!retryable) {
      combinedLog += `[pull-attempt ${attempt}/${retryCount}] not retryable; aborting retries\n`;
      break;
    }

    if (attempt < retryCount) {
      const delayMs = Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs);
      combinedLog += `[pull-attempt ${attempt}/${retryCount}] retrying in ${delayMs}ms\n`;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  return {
    success: false,
    imageName,
    log: combinedLog,
    error: lastError,
    failureClass: lastFailureClass,
    attempts: retryCount,
  };
}

function runDockerPull(
  imageName: string,
): Promise<{ success: boolean; log: string; error?: string; code?: number }> {
  return new Promise((resolve) => {
    let log = "";
    const proc = spawn("docker", ["pull", imageName]);

    proc.stdout.on("data", (data) => {
      log += data.toString();
    });

    proc.stderr.on("data", (data) => {
      log += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, log });
      } else {
        resolve({
          success: false,
          log,
          error: `Pull exited with code ${code}`,
          code: code ?? undefined,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, log, error: err.message });
    });
  });
}

function classifyPullFailure(log: string, error?: string): string {
  const full = `${log}\n${error ?? ""}`.toLowerCase();

  if (
    full.includes("context deadline exceeded") ||
    full.includes("i/o timeout") ||
    full.includes("tls handshake timeout") ||
    full.includes("proxyconnect tcp") ||
    full.includes("dial tcp")
  ) {
    return "infra/transient-network";
  }

  if (
    full.includes("toomanyrequests") ||
    full.includes("rate limit") ||
    full.includes("429")
  ) {
    return "infra/rate-limit";
  }

  if (
    full.includes("unauthorized") ||
    full.includes("authentication required") ||
    full.includes("denied")
  ) {
    return "registry/auth";
  }

  if (
    full.includes("manifest unknown") ||
    full.includes("not found") ||
    full.includes("name unknown")
  ) {
    return "image/not-found";
  }

  return "unknown";
}

function parseEnvInt(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(value, minimum);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getRegistryUrl(type: string, customUrl: string | null): string {
  if (type === "ghcr") return "ghcr.io";
  if (type === "dockerhub") return "docker.io";
  if (customUrl) return customUrl;
  throw new Error(`Unknown registry type: ${type}`);
}

export interface DockerLoginResult {
  success: boolean;
  error?: string;
}

export async function dockerLogin(
  registryUrl: string,
  username: string,
  password: string,
): Promise<DockerLoginResult> {
  return new Promise((resolve) => {
    const proc = spawn("docker", [
      "login",
      "-u",
      username,
      "--password-stdin",
      registryUrl,
    ]);

    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.stdin.write(password);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr || `Login failed with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export interface VolumeMount {
  name: string;
  path: string;
}

export interface FileMount {
  hostPath: string;
  containerPath: string;
}

export interface RunContainerOptions {
  imageName: string;
  hostPort: number;
  containerPort?: number;
  name: string;
  envVars?: Record<string, string>;
  network?: string;
  hostname?: string;
  networkAlias?: string;
  labels?: Record<string, string>;
  volumes?: VolumeMount[];
  fileMounts?: FileMount[];
  command?: string[];
  memoryLimit?: string;
  cpuLimit?: number;
  shutdownTimeout?: number;
}

export async function runContainer(
  options: RunContainerOptions,
): Promise<RunResult> {
  const args = buildDockerRunArgs(options);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("docker", args);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, containerId: stdout.trim() });
      } else {
        resolve({
          success: false,
          containerId: "",
          error: stderr || `docker run exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, containerId: "", error: err.message });
    });
  });
}

export async function stopContainer(name: string): Promise<void> {
  try {
    await execAsync(`docker rm -f ${shellEscape(name)}`);
  } catch {
    // Container might not exist
  }
}

export async function gracefulStopContainer(
  name: string,
  timeout: number = 30,
): Promise<void> {
  try {
    await execAsync(
      `docker stop --time ${Number(timeout)} ${shellEscape(name)}`,
    );
  } catch {
    // Container might not exist or already stopped
  }
  try {
    await execAsync(`docker rm -f ${shellEscape(name)}`);
  } catch {
    // Container might already be removed
  }
}

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Status}}' ${shellEscape(containerId)}`,
    );
    return stdout.trim().replace(/'/g, "");
  } catch {
    return "unknown";
  }
}

function checkTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkHttp(port: number, path: string): Promise<boolean> {
  try {
    const url = `http://127.0.0.1:${port}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

export interface HealthCheckOptions {
  containerId: string;
  port: number;
  path?: string | null;
  timeoutSeconds?: number;
}

export async function waitForHealthy(
  options: HealthCheckOptions,
): Promise<boolean> {
  const { containerId, port, path, timeoutSeconds = 60 } = options;
  const intervalMs = 1000;
  const maxAttempts = timeoutSeconds;
  let consecutiveExited = 0;
  const maxConsecutiveExited = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const status = await getContainerStatus(containerId);

    if (status === "exited" || status === "dead") {
      consecutiveExited++;
      if (consecutiveExited >= maxConsecutiveExited) {
        return false;
      }
    } else {
      consecutiveExited = 0;
    }

    if (status === "running") {
      const isHealthy = path
        ? await checkHttp(port, path)
        : await checkTcp(port);
      if (isHealthy) {
        return true;
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function isPortConflictError(error: string): boolean {
  return (
    error.includes("port is already allocated") ||
    error.includes("address already in use") ||
    error.includes("Bind for 0.0.0.0:")
  );
}

export function isContainerNameConflictError(error: string): boolean {
  return error.includes("is already in use by container");
}

export async function getAvailablePort(
  start: number = 10000,
  end: number = 20000,
  exclude?: Set<number>,
): Promise<number> {
  const usedPorts = new Set<number>();

  try {
    const { stdout } = await execAsync(`docker ps -a --format '{{.Ports}}'`);
    const portMatches = stdout.matchAll(/0\.0\.0\.0:(\d+)/g);
    for (const match of portMatches) {
      usedPorts.add(parseInt(match[1], 10));
    }
  } catch {
    // Ignore errors
  }

  try {
    const deployments = await db
      .selectFrom("deployments")
      .select("hostPort")
      .where("hostPort", "is not", null)
      .where("status", "in", [
        "pending",
        "cloning",
        "pulling",
        "building",
        "deploying",
        "running",
      ])
      .execute();
    for (const d of deployments) {
      if (d.hostPort) {
        usedPorts.add(d.hostPort);
      }
    }
  } catch {
    // Ignore - db might not be ready
  }

  try {
    const replicas = await db
      .selectFrom("replicas")
      .select("hostPort")
      .where("hostPort", "is not", null)
      .where("status", "in", ["pending", "running"])
      .execute();
    for (const r of replicas) {
      if (r.hostPort) {
        usedPorts.add(r.hostPort);
      }
    }
  } catch {
    // Ignore - table might not exist yet
  }

  for (let port = start; port < end; port++) {
    if (!usedPorts.has(port) && !exclude?.has(port)) {
      return port;
    }
  }

  throw new Error("No available ports");
}

export async function networkExists(name: string): Promise<boolean> {
  try {
    await execAsync(`docker network inspect ${shellEscape(name)}`);
    return true;
  } catch {
    return false;
  }
}

export async function createNetwork(
  name: string,
  labels?: Record<string, string>,
): Promise<void> {
  const exists = await networkExists(name);
  if (!exists) {
    const args = ["network", "create"];
    if (labels) {
      for (const [k, v] of Object.entries(labels)) {
        args.push("--label", `${k}=${v}`);
      }
    }
    args.push(name);
    try {
      await execAsync(`docker ${args.map(shellEscape).join(" ")}`);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        throw err;
      }
    }
  }
}

export async function removeNetwork(name: string): Promise<void> {
  try {
    await execAsync(`docker network rm ${shellEscape(name)}`);
  } catch {
    // Network might not exist or have containers attached
  }
}

export interface StreamLogsOptions {
  tail?: number;
  timestamps?: boolean;
  onData: (line: string) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export function streamContainerLogs(
  containerId: string,
  options: StreamLogsOptions,
): { stop: () => void } {
  const { tail = 100, timestamps = true, onData, onError, onClose } = options;
  const args = ["logs", "-f", "--tail", String(tail)];
  if (timestamps) {
    args.push("--timestamps");
  }
  args.push(containerId);

  const proc = spawn("docker", args);

  proc.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      onData(line);
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      onData(line);
    }
  });

  proc.on("error", (err) => {
    onError(err);
  });

  proc.on("close", () => {
    onClose();
  });

  return {
    stop: () => {
      proc.kill();
    },
  };
}

export async function listFrostImages(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `docker images --filter "label=frost.managed=true" --format '{{.Repository}}:{{.Tag}}'`,
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function getImageCreatedAt(image: string): Promise<Date> {
  const { stdout } = await execAsync(
    `docker inspect --format '{{.Created}}' ${shellEscape(image)}`,
  );
  return new Date(stdout.trim());
}

export async function getImageSize(image: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format '{{.Size}}' ${shellEscape(image)}`,
    );
    return parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

export async function removeImage(image: string): Promise<boolean> {
  try {
    await execAsync(`docker rmi ${shellEscape(image)}`);
    return true;
  } catch {
    return false;
  }
}

export async function imageExists(imageName: string): Promise<boolean> {
  try {
    await execAsync(`docker image inspect ${shellEscape(imageName)}`);
    return true;
  } catch {
    return false;
  }
}

export async function getRunningImageNames(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(`docker ps --format '{{.Image}}'`);
    return new Set(stdout.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function pruneDanglingImages(): Promise<{
  count: number;
  bytes: number;
}> {
  try {
    const { stdout } = await execAsync(
      `docker image prune -f --format '{{.SpaceReclaimed}}'`,
    );
    const match = stdout.match(/(\d+)/);
    const bytes = match ? parseInt(match[1], 10) : 0;
    const countMatch = stdout.match(/deleted (\d+)/i);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function listFrostNetworks(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `docker network ls --filter "label=frost.managed=true" --format '{{.Name}}'`,
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function isNetworkInUse(name: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker network inspect ${shellEscape(name)} --format '{{json .Containers}}'`,
    );
    const containers = JSON.parse(stdout.trim());
    return Object.keys(containers).length > 0;
  } catch {
    return false;
  }
}

export async function pruneStoppedContainers(): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `docker ps -a --filter "status=exited" --filter "label=frost.managed=true" --format '{{.Names}}'`,
    );
    const containers = stdout.trim().split("\n").filter(Boolean);
    for (const name of containers) {
      await execAsync(`docker rm ${shellEscape(name)}`).catch(() => {});
    }
    return containers.length;
  } catch {
    return 0;
  }
}

export async function pruneBuildCache(): Promise<{ bytes: number }> {
  try {
    const { stdout } = await execAsync(
      `docker builder prune -f --keep-storage 10GB`,
    );
    const match = stdout.match(
      /Total reclaimed space:\s*([\d.]+)\s*(B|KB|MB|GB)/i,
    );
    if (!match) {
      return { bytes: 0 };
    }
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };
    return { bytes: Math.round(value * (multipliers[unit] || 1)) };
  } catch {
    return { bytes: 0 };
  }
}
