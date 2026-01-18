import { Check, RotateCcw } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import { getTimeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DeploymentRowProps {
  id: string;
  commitSha: string;
  status: string;
  createdAt: number;
  selected: boolean;
  onClick: () => void;
  canRollback?: boolean;
  isRunning?: boolean;
  onRollback?: () => void;
  isRollingBack?: boolean;
  isCurrent?: boolean;
  imageName?: string | null;
}

function getDisplayStatus(status: string): string {
  return status;
}

export function DeploymentRow({
  commitSha,
  status,
  createdAt,
  selected,
  onClick,
  canRollback,
  isRunning,
  onRollback,
  isRollingBack,
  isCurrent,
  imageName,
}: DeploymentRowProps) {
  const date = new Date(createdAt);
  const timeAgo = getTimeAgo(date);
  const displayStatus = getDisplayStatus(status);

  function handleRollback(e: React.MouseEvent) {
    e.stopPropagation();
    onRollback?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: contains nested button for rollback
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group w-full px-4 py-3 text-left transition-colors hover:bg-neutral-800/50 cursor-pointer",
        selected && "bg-neutral-800",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={displayStatus} />
          <span className="font-mono text-sm text-neutral-300">
            {commitSha}
          </span>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
              <Check className="h-3 w-3" />
              Current
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 flex justify-center">
            {canRollback && !isRunning && (
              <button
                type="button"
                onClick={handleRollback}
                disabled={isRollingBack}
                title="Rollback to this deployment"
                className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-all disabled:opacity-50"
              >
                <RotateCcw
                  className={cn("h-3.5 w-3.5", isRollingBack && "animate-spin")}
                />
              </button>
            )}
          </span>
          <span className="text-xs text-neutral-500 w-14 text-right">
            {timeAgo}
          </span>
        </div>
      </div>
    </div>
  );
}
