import { exec } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db";

const execAsync = promisify(exec);

const TCP_PROXY_PORT_START = 20000;
const TCP_PROXY_PORT_END = 30000;

export async function getAvailableTcpProxyPort(): Promise<number> {
  const usedPorts = new Set<number>();

  const services = await db
    .selectFrom("services")
    .select("tcpProxyPort")
    .where("tcpProxyPort", "is not", null)
    .execute();

  for (const service of services) {
    if (service.tcpProxyPort) {
      usedPorts.add(service.tcpProxyPort);
    }
  }

  try {
    const { stdout } = await execAsync(`docker ps --format '{{.Ports}}'`);
    const portMatches = stdout.matchAll(/0\.0\.0\.0:(\d+)/g);
    for (const match of portMatches) {
      usedPorts.add(parseInt(match[1], 10));
    }
  } catch {
    // Ignore errors
  }

  for (let port = TCP_PROXY_PORT_START; port < TCP_PROXY_PORT_END; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error("No available TCP proxy ports");
}

export async function setupTcpProxy(
  serviceId: string,
  port: number,
): Promise<void> {
  await db
    .updateTable("services")
    .set({ tcpProxyPort: port })
    .where("id", "=", serviceId)
    .execute();
}

export async function removeTcpProxy(serviceId: string): Promise<void> {
  await db
    .updateTable("services")
    .set({ tcpProxyPort: null })
    .where("id", "=", serviceId)
    .execute();
}
