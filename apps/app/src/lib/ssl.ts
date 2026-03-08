import { exec } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { getSSLDir, getSSLPaths } from "./paths";

export { getSSLDir, getSSLPaths } from "./paths";

const execAsync = promisify(exec);

interface SSLOwner {
  uid: number;
  gid: number;
}

export function sslCertsExist(serviceId: string): boolean {
  const { cert, key } = getSSLPaths(serviceId);
  return existsSync(cert) && existsSync(key);
}

async function setSSLCertPermissions(
  serviceId: string,
  owner?: SSLOwner,
): Promise<void> {
  const { cert, key } = getSSLPaths(serviceId);

  await execAsync(`chmod 600 "${key}"`);
  try {
    const nextOwner = owner ?? { uid: 70, gid: 70 };
    await execAsync(
      `chown ${nextOwner.uid}:${nextOwner.gid} "${key}" "${cert}"`,
    );
  } catch {}
}

export async function generateSelfSignedCert(
  serviceId: string,
  owner?: SSLOwner,
): Promise<void> {
  const dir = getSSLDir(serviceId);
  const { cert, key } = getSSLPaths(serviceId);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!sslCertsExist(serviceId)) {
    await execAsync(
      `openssl req -new -x509 -days 3650 -nodes -out "${cert}" -keyout "${key}" -subj "/CN=postgres"`,
    );
  }

  await setSSLCertPermissions(serviceId, owner);
}

export async function removeSSLCerts(serviceId: string): Promise<void> {
  const dir = getSSLDir(serviceId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
