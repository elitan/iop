import { db } from "./db";
import { removeNetwork, stopContainer, stopContainersByLabel } from "./docker";
import { syncCaddyConfig } from "./domains";
import { removeSSLCerts } from "./ssl";
import { buildVolumeName, removeVolume } from "./volumes";

interface ServiceForCleanup {
  id: string;
  serviceType: string;
  volumes: string | null;
}

async function cleanupServiceResources(
  service: ServiceForCleanup,
): Promise<void> {
  if (service.volumes && service.volumes !== "[]") {
    const volumeConfig = JSON.parse(service.volumes) as {
      name: string;
      path: string;
    }[];
    for (const v of volumeConfig) {
      await removeVolume(buildVolumeName(service.id, v.name));
    }
  }

  if (service.serviceType === "database") {
    await removeSSLCerts(service.id);
  }
}

async function stopServiceContainers(serviceId: string): Promise<void> {
  await stopContainersByLabel("frost.service.id", serviceId);

  const deployments = await db
    .selectFrom("deployments")
    .select(["id", "containerId"])
    .where("serviceId", "=", serviceId)
    .execute();

  for (const deployment of deployments) {
    const replicas = await db
      .selectFrom("replicas")
      .select("containerId")
      .where("deploymentId", "=", deployment.id)
      .where("containerId", "is not", null)
      .execute();

    for (const r of replicas) {
      if (r.containerId) {
        await stopContainer(r.containerId);
      }
    }

    if (deployment.containerId) {
      await stopContainer(deployment.containerId);
    }
  }
}

export async function cleanupService(serviceId: string): Promise<void> {
  const service = await db
    .selectFrom("services")
    .select(["id", "serviceType", "volumes"])
    .where("id", "=", serviceId)
    .executeTakeFirst();

  if (!service) return;

  await stopServiceContainers(serviceId);
  await cleanupServiceResources(service);
}

export async function cleanupEnvironment(
  environment: { id: string; projectId: string },
  options: { syncCaddy?: boolean } = {},
): Promise<void> {
  const { syncCaddy = true } = options;

  const services = await db
    .selectFrom("services")
    .select(["id", "serviceType", "volumes"])
    .where("environmentId", "=", environment.id)
    .execute();

  for (const service of services) {
    await stopServiceContainers(service.id);
    await cleanupServiceResources(service);
  }

  await removeNetwork(
    `frost-net-${environment.projectId}-${environment.id}`.toLowerCase(),
  );

  await db
    .deleteFrom("environments")
    .where("id", "=", environment.id)
    .execute();

  if (syncCaddy) {
    try {
      await syncCaddyConfig();
    } catch {}
  }
}

export async function cleanupProject(projectId: string): Promise<void> {
  const environments = await db
    .selectFrom("environments")
    .select(["id", "projectId"])
    .where("projectId", "=", projectId)
    .execute();

  for (const env of environments) {
    await cleanupEnvironment(env, { syncCaddy: false });
  }

  await db.deleteFrom("projects").where("id", "=", projectId).execute();

  try {
    await syncCaddyConfig();
  } catch {}
}
