import { cn } from "@/lib/utils";

type Status =
  | "pending"
  | "cloning"
  | "pulling"
  | "building"
  | "deploying"
  | "running"
  | "failed";

const statusConfig: Record<Status, { color: string; pulse: boolean }> = {
  pending: { color: "bg-neutral-500", pulse: false },
  cloning: { color: "bg-yellow-500", pulse: true },
  pulling: { color: "bg-yellow-500", pulse: true },
  building: { color: "bg-yellow-500", pulse: true },
  deploying: { color: "bg-yellow-500", pulse: true },
  running: { color: "bg-green-500", pulse: false },
  failed: { color: "bg-red-500", pulse: false },
};

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
  const config = statusConfig[status as Status] ?? statusConfig.pending;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.pulse && "animate-[pulse-dot_2s_ease-in-out_infinite]",
        )}
      />
      {showLabel && (
        <span className="text-xs text-neutral-400 capitalize">{status}</span>
      )}
    </span>
  );
}
