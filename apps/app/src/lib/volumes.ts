import { exec } from "node:child_process";
import { promisify } from "node:util";

import { shellEscape } from "./shell-escape";

const execAsync = promisify(exec);

export async function createVolume(name: string): Promise<void> {
  try {
    await execAsync(`docker volume create ${shellEscape(name)}`);
  } catch {
    // Volume might already exist
  }
}

export async function removeVolume(name: string): Promise<void> {
  try {
    await execAsync(`docker volume rm ${shellEscape(name)}`);
  } catch {
    // Volume might not exist or be in use
  }
}

export async function listFrostVolumes(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `docker volume ls --filter "name=frost-" --format "{{.Name}}"`,
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function volumeExists(name: string): Promise<boolean> {
  try {
    await execAsync(`docker volume inspect ${shellEscape(name)}`);
    return true;
  } catch {
    return false;
  }
}

export function buildVolumeName(serviceId: string, volumeName: string): string {
  return `frost-${serviceId}-${volumeName}`;
}

export function pathToVolumeName(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, "-");
}

function parseDockerSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.round(value * (units[unit] ?? 1));
}

export async function getVolumeSize(name: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(`docker system df -v --format json`);
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.Volumes) {
        for (const vol of data.Volumes) {
          if (vol.Name === name) {
            const sizeStr = vol.UsageSize ?? vol.Size ?? "0B";
            return parseDockerSize(sizeStr);
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
