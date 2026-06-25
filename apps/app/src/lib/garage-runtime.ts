import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileMount } from "./docker";
import { GARAGE_REGION } from "./object-storage/config";
import { getDataDir } from "./paths";

const GARAGE_CONFIG_CONTAINER_PATH = "/etc/garage.toml";
const GARAGE_SERVER_COMMAND = ["/garage", "server", "--single-node"];

interface GarageRuntimeService {
  id: string;
  imageUrl: string | null;
  envVars?: string | null;
  command?: string | null;
}

export interface GarageRuntimeConfig {
  fileMounts: FileMount[];
  command: string[];
  logMessage: string;
}

interface GarageConfigOptions {
  adminToken?: string;
  metricsToken?: string;
  rpcSecret?: string;
  s3RootDomain?: string;
  webRootDomain?: string;
}

function parseEnvVars(raw: string | null | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  try {
    const values = JSON.parse(raw) as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const item of values) {
      if (typeof item.key === "string" && typeof item.value === "string") {
        result[item.key] = item.value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function getTomlString(value: string): string {
  return JSON.stringify(value);
}

function buildAdminConfig(options: GarageConfigOptions): string {
  const lines = [`api_bind_addr = "[::]:3903"`];
  if (options.adminToken) {
    lines.push(`admin_token = ${getTomlString(options.adminToken)}`);
  }
  if (options.metricsToken) {
    lines.push(`metrics_token = ${getTomlString(options.metricsToken)}`);
  }
  return lines.join("\n");
}

export function buildGarageConfigContent(
  options: GarageConfigOptions = {},
): string {
  const rpcSecret =
    options.rpcSecret ??
    "0000000000000000000000000000000000000000000000000000000000000000";
  const s3RootDomain = options.s3RootDomain ?? ".s3.garage.localhost";
  const webRootDomain = options.webRootDomain ?? ".web.garage.localhost";

  return `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = ${getTomlString(rpcSecret)}

[s3_api]
s3_region = ${getTomlString(GARAGE_REGION)}
api_bind_addr = "[::]:3900"
root_domain = ${getTomlString(s3RootDomain)}

[s3_web]
bind_addr = "[::]:3902"
root_domain = ${getTomlString(webRootDomain)}
index = "index.html"

[admin]
${buildAdminConfig(options)}
`;
}

export function isGarageImage(imageUrl: string | null): boolean {
  if (!imageUrl) {
    return false;
  }
  const normalized = imageUrl.toLowerCase();
  return (
    normalized === "dxflrs/garage" ||
    normalized.startsWith("dxflrs/garage:") ||
    normalized === "docker.io/dxflrs/garage" ||
    normalized.startsWith("docker.io/dxflrs/garage:")
  );
}

function getGarageConfigOptions(
  service: GarageRuntimeService,
): GarageConfigOptions {
  const envVars = parseEnvVars(service.envVars);
  return {
    adminToken: envVars.GARAGE_ADMIN_TOKEN,
    metricsToken: envVars.GARAGE_METRICS_TOKEN,
    rpcSecret: envVars.GARAGE_RPC_SECRET,
    s3RootDomain: envVars.GARAGE_S3_ROOT_DOMAIN,
    webRootDomain: envVars.GARAGE_WEB_ROOT_DOMAIN,
  };
}

function prepareGarageConfigFile(service: GarageRuntimeService): string {
  const options = getGarageConfigOptions(service);
  const dir = join(getDataDir(), "garage", service.id);
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "garage.toml");
  writeFileSync(configPath, buildGarageConfigContent(options));
  return configPath;
}

export function prepareGarageRuntime(
  service: GarageRuntimeService,
): GarageRuntimeConfig | null {
  if (!isGarageImage(service.imageUrl) || service.command) {
    return null;
  }

  const configPath = prepareGarageConfigFile(service);
  return {
    fileMounts: [
      {
        hostPath: configPath,
        containerPath: GARAGE_CONFIG_CONTAINER_PATH,
      },
    ],
    command: [...GARAGE_SERVER_COMMAND],
    logMessage: "Garage single-node config mounted\n",
  };
}
