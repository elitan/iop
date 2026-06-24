import type { Selectable } from "kysely";
import { db } from "./db";
import type { Deployments, Services } from "./db-types";
import {
  getDeployTimeoutError,
  getDeployTimeoutMs,
  hasDeploymentTimedOut,
} from "./deployment-timeout";
import {
  getContainerStatus as getContainerStatusDefault,
  listFrostContainers as listFrostContainersDefault,
  stopContainer as stopContainerDefault,
  stopContainersByLabel as stopContainersByLabelDefault,
} from "./docker";
import { getServiceRuntimeState } from "./service-runtime-status";

const IN_PROGRESS_DEPLOYMENT_STATUS_LIST = [
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
] as const;
const LIVE_CONTAINER_STATUSES = new Set(["running", "restarting", "paused"]);

let getContainerStatusFn = getContainerStatusDefault;
let listFrostContainersFn = listFrostContainersDefault;
let stopContainerFn = stopContainerDefault;
let stopContainersByLabelFn = stopContainersByLabelDefault;

export function setDeploymentRuntimeDockerForTests(fns: {
  getContainerStatus?: typeof getContainerStatusDefault;
  listFrostContainers?: typeof listFrostContainersDefault;
  stopContainer?: typeof stopContainerDefault;
  stopContainersByLabel?: typeof stopContainersByLabelDefault;
}): void {
  if (fns.getContainerStatus) getContainerStatusFn = fns.getContainerStatus;
  if (fns.listFrostContainers) listFrostContainersFn = fns.listFrostContainers;
  if (fns.stopContainer) stopContainerFn = fns.stopContainer;
  if (fns.stopContainersByLabel) {
    stopContainersByLabelFn = fns.stopContainersByLabel;
  }
}

export function resetDeploymentRuntimeDockerForTests(): void {
  getContainerStatusFn = getContainerStatusDefault;
  listFrostContainersFn = listFrostContainersDefault;
  stopContainerFn = stopContainerDefault;
  stopContainersByLabelFn = stopContainersByLabelDefault;
}

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

function canFailTimedOutDeployment(
  deployment: Selectable<Deployments> | null,
): deployment is Selectable<Deployments> {
  return deployment !== null && isInProgressDeploymentStatus(deployment.status);
}

function isInProgressDeploymentStatus(
  status: Selectable<Deployments>["status"],
): status is (typeof IN_PROGRESS_DEPLOYMENT_STATUS_LIST)[number] {
  return (IN_PROGRESS_DEPLOYMENT_STATUS_LIST as readonly string[]).includes(
    status,
  );
}

export async function stopDeploymentContainers(
  deploymentId: string,
): Promise<void> {
  await stopContainersByLabelFn("frost.deployment.id", deploymentId);

  const deployment = await db
    .selectFrom("deployments")
    .select("containerId")
    .where("id", "=", deploymentId)
    .executeTakeFirst();

  const replicas = await db
    .selectFrom("replicas")
    .select("containerId")
    .where("deploymentId", "=", deploymentId)
    .where("containerId", "is not", null)
    .execute();

  const containerIds = new Set<string>();
  if (deployment?.containerId) {
    containerIds.add(deployment.containerId);
  }

  for (const replica of replicas) {
    if (replica.containerId) {
      containerIds.add(replica.containerId);
    }
  }

  for (const containerId of containerIds) {
    await stopContainerFn(containerId);
  }
}

async function markDeploymentFailed(
  deployment: Selectable<Deployments>,
  errorMessage: string,
): Promise<Selectable<Deployments>> {
  const finishedAt = Date.now();

  await stopDeploymentContainers(deployment.id);

  await db
    .updateTable("replicas")
    .set({ status: "failed" })
    .where("deploymentId", "=", deployment.id)
    .execute();

  await db.transaction().execute(async function onTimeout(trx) {
    await trx
      .updateTable("deployments")
      .set({
        status: "failed",
        errorMessage,
        finishedAt,
        rollbackEligible: false,
      })
      .where("id", "=", deployment.id)
      .execute();

    await trx
      .updateTable("services")
      .set({ currentDeploymentId: null })
      .where("id", "=", deployment.serviceId)
      .where("currentDeploymentId", "=", deployment.id)
      .execute();

    await trx
      .deleteFrom("deploymentLocks")
      .where("deploymentId", "=", deployment.id)
      .execute();
  });

  return {
    ...deployment,
    status: "failed",
    errorMessage,
    finishedAt,
    rollbackEligible: false,
  };
}

async function markDeploymentTimedOut(
  deployment: Selectable<Deployments>,
): Promise<Selectable<Deployments>> {
  return markDeploymentFailed(deployment, getDeployTimeoutError());
}

async function reconcileTimedOutDeployment(
  deployment: Selectable<Deployments> | null,
): Promise<Selectable<Deployments> | null> {
  if (!canFailTimedOutDeployment(deployment)) {
    return deployment;
  }

  if (!hasDeploymentTimedOut(deployment.createdAt)) {
    return deployment;
  }

  return markDeploymentTimedOut(deployment);
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
    const status = await getContainerStatusFn(replica.containerId);
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
  const timedOutDeployment = await reconcileTimedOutDeployment(deployment);

  if (!canReconcileDeployment(timedOutDeployment)) {
    return timedOutDeployment;
  }

  const liveReplicaContainer = await hasLiveReplicaContainer(
    timedOutDeployment.id,
  );
  if (liveReplicaContainer === true) {
    return timedOutDeployment;
  }
  if (liveReplicaContainer === false) {
    return markDeploymentStopped(timedOutDeployment);
  }

  const containerStatus = await getContainerStatusFn(
    timedOutDeployment.containerId,
  );
  if (containerStatus === "unknown" || isContainerLive(containerStatus)) {
    return timedOutDeployment;
  }

  return markDeploymentStopped(timedOutDeployment);
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
): Promise<
  T & {
    latestDeployment: Selectable<Deployments> | null;
    runtimeStatus: "not-deployed" | "starting" | "online" | "offline";
    attentionStatus: "updating" | "last-deploy-failed" | null;
  }
> {
  const latestDeployment = await getLatestDeploymentWithRuntimeStatus(
    service.id,
  );
  const currentDeploymentId =
    latestDeployment?.status === "stopped" &&
    service.currentDeploymentId === latestDeployment.id
      ? null
      : service.currentDeploymentId;
  const serviceRuntime = getServiceRuntimeState({
    currentDeploymentId,
    latestDeployment,
  });

  return {
    ...service,
    currentDeploymentId,
    latestDeployment,
    runtimeStatus: serviceRuntime.runtimeStatus,
    attentionStatus: serviceRuntime.attentionStatus,
  };
}

export async function addLatestDeploymentsWithRuntimeStatus<
  T extends Selectable<Services>,
>(
  services: T[],
): Promise<
  Array<
    T & {
      latestDeployment: Selectable<Deployments> | null;
      runtimeStatus: "not-deployed" | "starting" | "online" | "offline";
      attentionStatus: "updating" | "last-deploy-failed" | null;
    }
  >
> {
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

export async function failStaleInProgressDeployments(): Promise<number> {
  const cutoff = Date.now() - getDeployTimeoutMs();
  const deployments = await db
    .selectFrom("deployments")
    .selectAll()
    .where("status", "in", [...IN_PROGRESS_DEPLOYMENT_STATUS_LIST])
    .where("createdAt", "<=", cutoff)
    .execute();

  let failedCount = 0;

  for (const deployment of deployments) {
    const reconciled = await reconcileTimedOutDeployment(deployment);
    if (reconciled?.status === "failed") {
      failedCount += 1;
    }
  }

  return failedCount;
}

async function stopOrphanDeploymentContainers(): Promise<number> {
  const containers = await listFrostContainersFn();
  const deploymentContainers = containers.filter(
    function hasDeploymentId(container) {
      return Boolean(container.labels["frost.deployment.id"]);
    },
  );

  if (deploymentContainers.length === 0) {
    return 0;
  }

  const deploymentIds = [
    ...new Set(
      deploymentContainers
        .map(function mapDeploymentId(container) {
          return container.labels["frost.deployment.id"];
        })
        .filter(function hasValue(value): value is string {
          return Boolean(value);
        }),
    ),
  ];

  const deployments = await db
    .selectFrom("deployments")
    .select(["id", "status", "containerId", "createdAt"])
    .where("id", "in", deploymentIds)
    .execute();

  const staleCutoff = Date.now() - getDeployTimeoutMs();
  const preservedInProgressDeploymentIds = new Set(
    deployments
      .filter(function isFreshInProgress(deployment) {
        return (
          isInProgressDeploymentStatus(deployment.status) &&
          deployment.createdAt > staleCutoff
        );
      })
      .map(function mapId(deployment) {
        return deployment.id;
      }),
  );

  const runningDeploymentIds = deployments
    .filter(function isRunning(deployment) {
      return deployment.status === "running";
    })
    .map(function mapId(deployment) {
      return deployment.id;
    });

  const activeContainerIds = new Set<string>();
  for (const deployment of deployments) {
    if (deployment.status === "running" && deployment.containerId) {
      activeContainerIds.add(deployment.containerId);
    }
  }

  if (runningDeploymentIds.length > 0) {
    const replicas = await db
      .selectFrom("replicas")
      .select("containerId")
      .where("deploymentId", "in", runningDeploymentIds)
      .where("status", "=", "running")
      .where("containerId", "is not", null)
      .execute();

    for (const replica of replicas) {
      if (replica.containerId) {
        activeContainerIds.add(replica.containerId);
      }
    }
  }

  const stoppedContainerIds = new Set<string>();
  for (const container of deploymentContainers) {
    const deploymentId = container.labels["frost.deployment.id"];
    if (deploymentId && preservedInProgressDeploymentIds.has(deploymentId)) {
      continue;
    }
    if (activeContainerIds.has(container.id)) {
      continue;
    }
    await stopContainerFn(container.id);
    stoppedContainerIds.add(container.id);
  }

  return stoppedContainerIds.size;
}

export async function reconcileDeploymentStartupState(): Promise<{
  failedDeployments: number;
  stoppedOrphanContainers: number;
}> {
  const failedDeployments = await failStaleInProgressDeployments();
  const stoppedOrphanContainers = await stopOrphanDeploymentContainers();

  return { failedDeployments, stoppedOrphanContainers };
}
