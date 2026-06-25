import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileMount } from "./docker";
import { getDataDir } from "./paths";

const GARAGE_CONFIG_CONTAINER_PATH = "/etc/garage.toml";
const GARAGE_SERVER_COMMAND = [
  "/garage",
  "server",
  "--single-node",
  "--default-bucket",
];

interface GarageRuntimeService {
  id: string;
  imageUrl: string | null;
  command?: string | null;
}

export interface GarageRuntimeConfig {
  fileMounts: FileMount[];
  command: string[];
  logMessage: string;
}

export function buildGarageConfigContent(): string {
  return `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "0000000000000000000000000000000000000000000000000000000000000000"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"
index = "index.html"

[admin]
api_bind_addr = "[::]:3903"
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

function prepareGarageConfigFile(serviceId: string): string {
  const dir = join(getDataDir(), "garage", serviceId);
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "garage.toml");
  writeFileSync(configPath, buildGarageConfigContent());
  return configPath;
}

export function prepareGarageRuntime(
  service: GarageRuntimeService,
): GarageRuntimeConfig | null {
  if (!isGarageImage(service.imageUrl) || service.command) {
    return null;
  }

  const configPath = prepareGarageConfigFile(service.id);
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
