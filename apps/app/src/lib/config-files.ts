import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function safeFileName(path: string): string {
  return path.replace(/\//g, "__").replace(/^__/, "");
}

export interface ConfigFile {
  path: string;
  content: string;
}

function getConfigDir(serviceId: string): string {
  const dataDir = process.env.FROST_DATA_DIR || join(process.cwd(), "data");
  return join(dataDir, "services", serviceId, "configs");
}

export function writeConfigFiles(serviceId: string, files: ConfigFile[]): void {
  if (files.length === 0) return;

  const configDir = getConfigDir(serviceId);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  for (const file of files) {
    const hostPath = join(configDir, safeFileName(file.path));
    writeFileSync(hostPath, file.content);
    chmodSync(hostPath, 0o644);
  }
}

export function getConfigFileMounts(
  serviceId: string,
  files: ConfigFile[],
): Array<{ hostPath: string; containerPath: string }> {
  if (files.length === 0) return [];

  const configDir = getConfigDir(serviceId);

  return files.map((file) => ({
    hostPath: join(configDir, safeFileName(file.path)),
    containerPath: file.path,
  }));
}

export function deleteConfigFiles(serviceId: string): void {
  const configDir = getConfigDir(serviceId);
  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true, force: true });
  }
}
