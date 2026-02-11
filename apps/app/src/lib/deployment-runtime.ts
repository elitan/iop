import type { Selectable } from "kysely";
import { db } from "./db";
import type { Deployments, Services } from "./db-types";
import { getContainerStatus } from "./docker";

const LIVE_CONTAINER_STATUSES = new Set(["running", "restarting", "paused"]);

function isContainerLive(status: string): boolean {
  return LIVE_CONTAINER_STATUSES.has(status);
}

function canReconcileDeployment(
  deployment: Selectable<Deployments> | null,
): deployment is Selectable<Deployments> & { containerId: string } {
  return (
    deployment !== null &&
    deployment.status === "running" &&
    !!deployment.containerId
  );
}

function isDeployment(
  deployment: Selectable<Deployments> | null,
): deployment is Selectable<Deployments> {
  return deployment !== null;
}

async function hasLiveReplicaContainer(
  deploymentId: string,
): Promise<boolean | null> {
  const replicas = await db
    .selectFrom("replicas")
    .select("containerId")
    .where("deploymentId", "=", deploymentId)
    .where("status", "=", "running")
    .where("containerId", "is not", null)
    .orderBy("replicaIndex", "asc")
    .execute();

  if (replicas.length === 0) {
    return null;
  }

  for (const replica of replicas) {
    if (!replica.containerId) {
      continue;
    }
    const status = await getContainerStatus(replica.containerId);
    if (status === "unknown" || isContainerLive(status)) {
      return true;
    }
  }

  return false;
}

async function markDeploymentStopped(
  deployment: Selectable<Deployments> & { containerId: string },
): Promise<Selectable<Deployments>> {
  const finishedAt = deployment.finishedAt ?? Date.now();

  await db
    .updateTable("deployments")
    .set({ status: "stopped", finishedAt })
    .where("id", "=", deployment.id)
    .execute();

  await db
    .updateTable("services")
    .set({ currentDeploymentId: null })
    .where("id", "=", deployment.serviceId)
    .where("currentDeploymentId", "=", deployment.id)
    .execute();

  return { ...deployment, status: "stopped", finishedAt };
}

export async function reconcileDeploymentRuntimeStatus(
  deployment: Selectable<Deployments> | null,
): Promise<Selectable<Deployments> | null> {
  if (!canReconcileDeployment(deployment)) {
    return deployment;
  }

  const liveReplicaContainer = await hasLiveReplicaContainer(deployment.id);
  if (liveReplicaContainer === true) {
    return deployment;
  }
  if (liveReplicaContainer === false) {
    return markDeploymentStopped(deployment);
  }

  const containerStatus = await getContainerStatus(deployment.containerId);
  if (containerStatus === "unknown" || isContainerLive(containerStatus)) {
    return deployment;
  }

  return markDeploymentStopped(deployment);
}

export async function getLatestDeploymentWithRuntimeStatus(
  serviceId: string,
): Promise<Selectable<Deployments> | null> {
  const latestDeployment = await db
    .selectFrom("deployments")
    .selectAll()
    .where("serviceId", "=", serviceId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();

  return reconcileDeploymentRuntimeStatus(latestDeployment ?? null);
}

export async function addLatestDeploymentWithRuntimeStatus<
  T extends Selectable<Services>,
>(
  service: T,
): Promise<T & { latestDeployment: Selectable<Deployments> | null }> {
  const latestDeployment = await getLatestDeploymentWithRuntimeStatus(
    service.id,
  );
  const currentDeploymentId =
    latestDeployment?.status === "stopped" &&
    service.currentDeploymentId === latestDeployment.id
      ? null
      : service.currentDeploymentId;
  return { ...service, currentDeploymentId, latestDeployment };
}

export async function addLatestDeploymentsWithRuntimeStatus<
  T extends Selectable<Services>,
>(
  services: T[],
): Promise<(T & { latestDeployment: Selectable<Deployments> | null })[]> {
  return Promise.all(services.map(addLatestDeploymentWithRuntimeStatus));
}

export async function reconcileDeploymentsRuntimeStatus(
  deployments: Selectable<Deployments>[],
): Promise<Selectable<Deployments>[]> {
  const reconciled = await Promise.all(
    deployments.map((deployment) =>
      reconcileDeploymentRuntimeStatus(deployment),
    ),
  );
  return reconciled.filter(isDeployment);
}
