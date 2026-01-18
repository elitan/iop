import { join } from "node:path";

export function getDataDir(): string {
  if (process.env.FROST_DATA_DIR) {
    return process.env.FROST_DATA_DIR;
  }
  return join(process.cwd(), "data");
}

export function getDbPath(): string {
  if (process.env.FROST_DB_PATH) {
    return process.env.FROST_DB_PATH;
  }
  return join(getDataDir(), "frost.db");
}

export function getSSLBasePath(): string {
  return process.env.FROST_SSL_PATH || join(getDataDir(), "ssl");
}

export function getSSLDir(serviceId: string): string {
  return join(getSSLBasePath(), serviceId);
}

export function getSSLPaths(serviceId: string): { cert: string; key: string } {
  const dir = getSSLDir(serviceId);
  return {
    cert: join(dir, "server.crt"),
    key: join(dir, "server.key"),
  };
}
