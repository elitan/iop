import { exec } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { getSSLDir, getSSLPaths } from "./paths";

export { getSSLDir, getSSLPaths } from "./paths";

const execAsync = promisify(exec);

export function sslCertsExist(serviceId: string): boolean {
  const { cert, key } = getSSLPaths(serviceId);
  return existsSync(cert) && existsSync(key);
}

export async function generateSelfSignedCert(serviceId: string): Promise<void> {
  const dir = getSSLDir(serviceId);
  const { cert, key } = getSSLPaths(serviceId);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (sslCertsExist(serviceId)) {
    return;
  }

  await execAsync(
    `openssl req -new -x509 -days 3650 -nodes -out "${cert}" -keyout "${key}" -subj "/CN=postgres"`,
  );

  await execAsync(`chmod 600 "${key}"`);
  try {
    await execAsync(`chown 70:70 "${key}" "${cert}"`);
  } catch {
    // chown requires root - on dev/CI this will fail but that's ok
  }
}

export async function removeSSLCerts(serviceId: string): Promise<void> {
  const dir = getSSLDir(serviceId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
