export type DatabaseTargetStoppedReason = "idle" | "failed";

type DatabaseTargetStatusTone = "neutral" | "info" | "success" | "danger";

interface DatabaseTargetStatusInput {
  name: string;
  lifecycleStatus: "active" | "stopped" | "expired";
  stoppedReason: DatabaseTargetStoppedReason | null;
  scaleToZeroMinutes: number | null;
}

interface DatabaseTargetStatus {
  label: "active" | "sleeping" | "failed" | "stopped" | "expired";
  tone: DatabaseTargetStatusTone;
  helperText: string | null;
}

export function getDatabaseTargetStatus(
  input: DatabaseTargetStatusInput,
): DatabaseTargetStatus {
  if (input.lifecycleStatus === "active") {
    return {
      label: "active",
      tone: "success",
      helperText:
        input.name !== "main" && input.scaleToZeroMinutes !== null
          ? `sleeps after ${input.scaleToZeroMinutes}m idle`
          : null,
    };
  }

  if (input.lifecycleStatus === "expired") {
    return {
      label: "expired",
      tone: "danger",
      helperText: null,
    };
  }

  if (
    input.stoppedReason === "idle" &&
    input.name !== "main" &&
    input.scaleToZeroMinutes !== null
  ) {
    return {
      label: "sleeping",
      tone: "info",
      helperText: "wakes on next connection",
    };
  }

  if (input.stoppedReason === "failed") {
    return {
      label: "failed",
      tone: "danger",
      helperText: "last start failed. try restart",
    };
  }

  return {
    label: "stopped",
    tone: "neutral",
    helperText: "not running",
  };
}
