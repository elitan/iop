import { cn } from "@/lib/utils";

type DeploymentIndicatorTone = "neutral" | "info" | "success" | "danger";

interface DeploymentIndicatorConfig {
  tone: DeploymentIndicatorTone;
  label: string;
  pulse: boolean;
}

const toneClassName: Record<DeploymentIndicatorTone, string> = {
  neutral: "bg-neutral-500",
  info: "bg-blue-500",
  success: "bg-green-500",
  danger: "bg-red-500",
};

function getDeploymentIndicatorConfig(
  status: string,
): DeploymentIndicatorConfig {
  switch (status) {
    case "pending":
    case "cloning":
    case "pulling":
    case "building":
    case "deploying":
      return {
        tone: "info",
        label: status,
        pulse: true,
      };
    case "running":
      return {
        tone: "success",
        label: "running",
        pulse: false,
      };
    case "failed":
      return {
        tone: "danger",
        label: "failed",
        pulse: false,
      };
    case "stopped":
      return {
        tone: "neutral",
        label: "stopped",
        pulse: false,
      };
    case "cancelled":
      return {
        tone: "neutral",
        label: "cancelled",
        pulse: false,
      };
    default:
      return {
        tone: "neutral",
        label: status,
        pulse: false,
      };
  }
}

interface DeploymentStatusIndicatorProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

export function DeploymentStatusIndicator({
  status,
  className,
  showLabel = false,
}: DeploymentStatusIndicatorProps) {
  const config = getDeploymentIndicatorConfig(status);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          toneClassName[config.tone],
          config.pulse && "animate-[pulse-dot_2s_ease-in-out_infinite]",
        )}
      />
      {showLabel ? (
        <span className="text-xs text-neutral-400">{config.label}</span>
      ) : null}
    </span>
  );
}
