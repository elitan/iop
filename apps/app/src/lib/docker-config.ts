import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const DAEMON_JSON = "/etc/docker/daemon.json";
const DEFAULT_ADDRESS_POOLS = [
  { base: "10.0.0.0/8", size: 24 },
  { base: "172.17.0.0/12", size: 24 },
  { base: "192.168.0.0/16", size: 24 },
];

function readDaemonConfig(): Record<string, unknown> {
  if (!existsSync(DAEMON_JSON)) return {};
  try {
    return JSON.parse(readFileSync(DAEMON_JSON, "utf-8"));
  } catch {
    return {};
  }
}

export async function ensureDockerNetworkConfig(): Promise<boolean> {
  if (process.platform !== "linux") return false;

  const config = readDaemonConfig();
  if (config["default-address-pools"]) return false;

  const { stdout: runningIds } = await execAsync(
    "docker ps -q 2>/dev/null || true",
  );
  const containerIds = runningIds.trim();

  config["default-address-pools"] = DEFAULT_ADDRESS_POOLS;
  writeFileSync(DAEMON_JSON, JSON.stringify(config, null, 2));
  await execAsync("systemctl restart docker");

  if (containerIds) {
    await execAsync(
      `echo "${containerIds}" | xargs -r docker start 2>/dev/null || true`,
    );
  }

  return true;
}
