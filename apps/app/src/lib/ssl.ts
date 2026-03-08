import { exec } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { getSSLDir, getSSLPaths } from "./paths";

export { getSSLDir, getSSLPaths } from "./paths";

const execAsync = promisify(exec);
const POSTGRES_SSL_BOOTSTRAP = `#!/bin/sh
set -e
mkdir -p /tmp/frost-postgres-ssl
cp /run/frost-postgres-ssl/server.crt /tmp/frost-postgres-ssl/server.crt
cp /run/frost-postgres-ssl/server.key /tmp/frost-postgres-ssl/server.key
chown postgres:postgres /tmp/frost-postgres-ssl/server.crt /tmp/frost-postgres-ssl/server.key
chmod 600 /tmp/frost-postgres-ssl/server.key
exec /usr/local/bin/docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/frost-postgres-ssl/server.crt -c ssl_key_file=/tmp/frost-postgres-ssl/server.key
`;

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

export function getPostgresSSLBootstrapPath(serviceId: string): string {
  return join(getSSLDir(serviceId), "bootstrap-postgres.sh");
}

export async function preparePostgresSSLAssets(
  serviceId: string,
  owner?: SSLOwner,
): Promise<{
  bootstrap: string;
  cert: string;
  key: string;
}> {
  await generateSelfSignedCert(serviceId, owner);

  const bootstrap = getPostgresSSLBootstrapPath(serviceId);
  writeFileSync(bootstrap, POSTGRES_SSL_BOOTSTRAP);
  await execAsync(`chmod 700 "${bootstrap}"`);

  const { cert, key } = getSSLPaths(serviceId);
  return { bootstrap, cert, key };
}

export async function removeSSLCerts(serviceId: string): Promise<void> {
  const dir = getSSLDir(serviceId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
