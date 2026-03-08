import type {
  ServiceAttentionStatus,
  ServiceRuntimeStatus,
} from "./service-runtime-status";

interface DatabaseTargetLike {
  lifecycleStatus: "active" | "stopped" | "expired";
}

interface DatabaseTargetDeploymentLike {
  status: "running" | "failed" | "stopped";
}

interface DatabaseRuntimeInput {
  mainTarget: DatabaseTargetLike | null;
  latestDeployment: DatabaseTargetDeploymentLike | null;
}

interface DatabaseRuntimeState {
  runtimeStatus: ServiceRuntimeStatus;
  attentionStatus: ServiceAttentionStatus;
}

const ONLINE_STATE: DatabaseRuntimeState = {
  runtimeStatus: "online",
  attentionStatus: null,
};

const ONLINE_FAILED_STATE: DatabaseRuntimeState = {
  runtimeStatus: "online",
  attentionStatus: "last-deploy-failed",
};

const OFFLINE_STATE: DatabaseRuntimeState = {
  runtimeStatus: "offline",
  attentionStatus: null,
};

export function getDatabaseRuntimeState(
  input: DatabaseRuntimeInput,
): DatabaseRuntimeState {
  if (input.mainTarget?.lifecycleStatus !== "active") {
    return OFFLINE_STATE;
  }

  if (input.latestDeployment?.status === "failed") {
    return ONLINE_FAILED_STATE;
  }

  return ONLINE_STATE;
}
