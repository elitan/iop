import { exec, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { join, relative } from "node:path";
import { promisify } from "node:util";

import { db } from "./db";

const execAsync = promisify(exec);

export interface BuildResult {
  success: boolean;
  imageName: string;
  log: string;
  error?: string;
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
      log += data.toString();
    });

    proc.stderr.on("data", (data) => {
      log += data.toString();
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
        resolve({ success: true, imageName, log });
      } else {
        resolve({
          success: false,
          imageName,
          log,
          error: `Pull exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, imageName, log, error: err.message });
    });
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

const DEFAULT_PORT = 8080;

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
  const {
    imageName,
    hostPort,
    containerPort = DEFAULT_PORT,
    name,
    envVars,
    network,
    hostname,
    networkAlias,
    labels,
    volumes,
    fileMounts,
    command,
    memoryLimit,
    cpuLimit,
    shutdownTimeout,
  } = options;
  try {
    const allEnvVars = { PORT: String(containerPort), ...envVars };
    const envFlags = Object.entries(allEnvVars)
      .map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`)
      .join(" ");
    const networkFlag = network ? `--network ${network}` : "";
    const networkAliasFlag =
      network && networkAlias ? `--network-alias ${networkAlias}` : "";
    const hostnameFlag = hostname ? `--hostname ${hostname}` : "";
    const labelFlags = labels
      ? Object.entries(labels)
          .map(([k, v]) => `--label ${k}=${JSON.stringify(v)}`)
          .join(" ")
      : "";
    const volumeFlags = volumes
      ? volumes.map((v) => `-v ${v.name}:${v.path}`).join(" ")
      : "";
    const fileMountFlags = fileMounts
      ? fileMounts
          .map((f) => `-v ${f.hostPath}:${f.containerPath}:ro`)
          .join(" ")
      : "";
    const commandPart = command
      ? command.map((c) => JSON.stringify(c)).join(" ")
      : "";
    const logOpts = "--log-opt max-size=10m --log-opt max-file=3";
    const memoryFlag = memoryLimit ? `--memory ${memoryLimit}` : "";
    const cpuFlag = cpuLimit ? `--cpus ${cpuLimit}` : "";
    const stopTimeoutFlag = shutdownTimeout
      ? `--stop-timeout ${shutdownTimeout}`
      : "";
    const { stdout } = await execAsync(
      `docker run -d --restart on-failure:5 ${logOpts} ${memoryFlag} ${cpuFlag} ${stopTimeoutFlag} --name ${name} -p ${hostPort}:${containerPort} ${networkFlag} ${networkAliasFlag} ${hostnameFlag} ${labelFlags} ${volumeFlags} ${fileMountFlags} ${envFlags} ${imageName} ${commandPart}`.replace(
        /\s+/g,
        " ",
      ),
    );
    const containerId = stdout.trim();
    return { success: true, containerId };
  } catch (err: any) {
    return {
      success: false,
      containerId: "",
      error: err.stderr || err.message,
    };
  }
}

export async function stopContainer(name: string): Promise<void> {
  try {
    await execAsync(`docker rm -f ${name}`);
  } catch {
    // Container might not exist
  }
}

export async function gracefulStopContainer(
  name: string,
  timeout: number = 30,
): Promise<void> {
  try {
    await execAsync(`docker stop --time ${timeout} ${name}`);
  } catch {
    // Container might not exist or already stopped
  }
  try {
    await execAsync(`docker rm ${name}`);
  } catch {
    // Container might already be removed
  }
}

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Status}}' ${containerId}`,
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

  for (let port = start; port < end; port++) {
    if (!usedPorts.has(port) && !exclude?.has(port)) {
      return port;
    }
  }

  throw new Error("No available ports");
}

export async function networkExists(name: string): Promise<boolean> {
  try {
    await execAsync(`docker network inspect ${name}`);
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
    const labelFlags = labels
      ? Object.entries(labels)
          .map(([k, v]) => `--label ${k}=${JSON.stringify(v)}`)
          .join(" ")
      : "";
    try {
      await execAsync(`docker network create ${labelFlags} ${name}`.trim());
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        throw err;
      }
    }
  }
}

export async function removeNetwork(name: string): Promise<void> {
  try {
    await execAsync(`docker network rm ${name}`);
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
    `docker inspect --format '{{.Created}}' ${image}`,
  );
  return new Date(stdout.trim());
}

export async function getImageSize(image: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format '{{.Size}}' ${image}`,
    );
    return parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

export async function removeImage(image: string): Promise<boolean> {
  try {
    await execAsync(`docker rmi ${image}`);
    return true;
  } catch {
    return false;
  }
}

export async function imageExists(imageName: string): Promise<boolean> {
  try {
    await execAsync(`docker image inspect ${imageName}`);
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
      `docker network inspect ${name} --format '{{json .Containers}}'`,
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
      await execAsync(`docker rm ${name}`).catch(() => {});
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
