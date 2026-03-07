import { StatusBadge } from "@/components/status-badge";
import type {
  ServiceAttentionStatus,
  ServiceRuntimeStatus,
} from "@/lib/service-runtime-status";
import { cn } from "@/lib/utils";

type ServiceIndicatorTone = "neutral" | "info" | "success" | "danger";

interface ServiceIndicatorConfig {
  tone: ServiceIndicatorTone;
  label: string;
  pulse: boolean;
}

const toneClassName: Record<ServiceIndicatorTone, string> = {
  neutral: "bg-neutral-500",
  info: "bg-blue-500",
  success: "bg-green-500",
  danger: "bg-red-500",
};

const runtimeConfig: Record<ServiceRuntimeStatus, ServiceIndicatorConfig> = {
  "not-deployed": {
    tone: "neutral",
    label: "not deployed",
    pulse: false,
  },
  starting: {
    tone: "info",
    label: "starting",
    pulse: true,
  },
  online: {
    tone: "success",
    label: "online",
    pulse: false,
  },
  offline: {
    tone: "danger",
    label: "offline",
    pulse: false,
  },
};

const attentionConfig: Record<
  NonNullable<ServiceAttentionStatus>,
  { tone: "info" | "warning"; label: string }
> = {
  updating: {
    tone: "info",
    label: "updating",
  },
  "last-deploy-failed": {
    tone: "warning",
    label: "last deploy failed",
  },
};

interface ServiceRuntimeIndicatorProps {
  runtimeStatus: ServiceRuntimeStatus;
  attentionStatus?: ServiceAttentionStatus;
  className?: string;
  showLabel?: boolean;
  showAttention?: boolean;
}

export function ServiceRuntimeIndicator({
  runtimeStatus,
  attentionStatus = null,
  className,
  showLabel = false,
  showAttention = true,
}: ServiceRuntimeIndicatorProps) {
  const config = runtimeConfig[runtimeStatus];
  const attention = attentionStatus ? attentionConfig[attentionStatus] : null;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-2">
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
      {showAttention && attention ? (
        <StatusBadge tone={attention.tone}>{attention.label}</StatusBadge>
      ) : null}
    </span>
  );
}
