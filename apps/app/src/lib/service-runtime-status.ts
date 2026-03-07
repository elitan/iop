type DeploymentStatus =
  | "pending"
  | "cloning"
  | "pulling"
  | "building"
  | "deploying"
  | "running"
  | "failed"
  | "stopped"
  | "cancelled";

export type ServiceRuntimeStatus =
  | "not-deployed"
  | "starting"
  | "online"
  | "offline";

export type ServiceAttentionStatus = "updating" | "last-deploy-failed" | null;

interface DeploymentLike {
  id: string;
  status: DeploymentStatus;
}

interface ServiceRuntimeInput {
  currentDeploymentId: string | null;
  latestDeployment: DeploymentLike | null;
}

interface ServiceRuntimeState {
  runtimeStatus: ServiceRuntimeStatus;
  attentionStatus: ServiceAttentionStatus;
}

const IN_PROGRESS_STATUSES = new Set<DeploymentStatus>([
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
]);

function isInProgressStatus(status: DeploymentStatus): boolean {
  return IN_PROGRESS_STATUSES.has(status);
}

const NOT_DEPLOYED_STATE: ServiceRuntimeState = {
  runtimeStatus: "not-deployed",
  attentionStatus: null,
};

const STARTING_STATE: ServiceRuntimeState = {
  runtimeStatus: "starting",
  attentionStatus: null,
};

const ONLINE_STATE: ServiceRuntimeState = {
  runtimeStatus: "online",
  attentionStatus: null,
};

const ONLINE_UPDATING_STATE: ServiceRuntimeState = {
  runtimeStatus: "online",
  attentionStatus: "updating",
};

const ONLINE_FAILED_STATE: ServiceRuntimeState = {
  runtimeStatus: "online",
  attentionStatus: "last-deploy-failed",
};

const OFFLINE_STATE: ServiceRuntimeState = {
  runtimeStatus: "offline",
  attentionStatus: null,
};

export function getServiceRuntimeState(
  input: ServiceRuntimeInput,
): ServiceRuntimeState {
  const latestDeployment = input.latestDeployment;

  if (!latestDeployment) {
    return NOT_DEPLOYED_STATE;
  }

  const latestIsCurrent = latestDeployment.id === input.currentDeploymentId;
  const hasCurrentDeployment =
    input.currentDeploymentId !== null || latestDeployment.status === "running";

  if (hasCurrentDeployment) {
    if (!latestIsCurrent && isInProgressStatus(latestDeployment.status)) {
      return ONLINE_UPDATING_STATE;
    }

    if (!latestIsCurrent && latestDeployment.status === "failed") {
      return ONLINE_FAILED_STATE;
    }

    return ONLINE_STATE;
  }

  if (isInProgressStatus(latestDeployment.status)) {
    return STARTING_STATE;
  }

  return OFFLINE_STATE;
}
