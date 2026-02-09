import { cn } from "@/lib/utils";

type StatusColor = "yellow" | "red" | "green";

interface StatusConfig {
  color: string;
  pulse: boolean;
}

const colorConfig: Record<StatusColor, StatusConfig> = {
  yellow: { color: "bg-yellow-500", pulse: true },
  red: { color: "bg-red-500", pulse: false },
  green: { color: "bg-green-500", pulse: false },
};

function getStatusColor(status: string): StatusColor {
  switch (status) {
    case "pending":
    case "cloning":
    case "pulling":
    case "building":
    case "deploying":
      return "yellow";
    case "stopped":
    case "failed":
    case "cancelled":
      return "red";
    default:
      return "green";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
    case "cloning":
    case "pulling":
    case "building":
    case "deploying":
      return "pending";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "stopped":
      return "stopped";
    default:
      return "ok";
  }
}

interface StatusDotProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

export function StatusDot({
  status,
  className,
  showLabel = false,
}: StatusDotProps) {
  const statusColor = getStatusColor(status);
  const config = colorConfig[statusColor];
  const label = getStatusLabel(status);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.pulse && "animate-[pulse-dot_2s_ease-in-out_infinite]",
        )}
      />
      {showLabel && <span className="text-xs text-neutral-400">{label}</span>}
    </span>
  );
}

export { getStatusColor, colorConfig, getStatusLabel };
