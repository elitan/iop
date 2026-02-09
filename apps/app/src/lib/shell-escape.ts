import type { RunContainerOptions } from "./docker";

export function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export function buildDockerRunArgs(options: RunContainerOptions): string[] {
  const {
    imageName,
    hostPort,
    containerPort = 8080,
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

  const args = [
    "run",
    "-d",
    "--restart",
    "unless-stopped",
    "--log-opt",
    "max-size=10m",
    "--log-opt",
    "max-file=3",
  ];

  if (memoryLimit) {
    args.push("--memory", memoryLimit);
  }
  if (cpuLimit) {
    args.push("--cpus", String(cpuLimit));
  }
  if (shutdownTimeout !== undefined) {
    args.push("--stop-timeout", String(shutdownTimeout));
  }

  args.push("--name", name);
  args.push("-p", `${hostPort}:${containerPort}`);

  if (network) {
    args.push("--network", network);
  }
  if (network && networkAlias) {
    args.push("--network-alias", networkAlias);
  }
  if (hostname) {
    args.push("--hostname", hostname);
  }

  if (labels) {
    for (const [k, v] of Object.entries(labels)) {
      args.push("--label", `${k}=${v}`);
    }
  }

  if (volumes) {
    for (const v of volumes) {
      args.push("-v", `${v.name}:${v.path}`);
    }
  }

  if (fileMounts) {
    for (const f of fileMounts) {
      args.push("-v", `${f.hostPath}:${f.containerPath}:ro`);
    }
  }

  const allEnvVars: Record<string, string> = {
    PORT: String(containerPort),
    ...envVars,
  };
  for (const [k, v] of Object.entries(allEnvVars)) {
    args.push("-e", `${k}=${v}`);
  }

  args.push(imageName);

  if (command) {
    args.push(...command);
  }

  return args;
}
