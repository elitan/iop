import { Check, GitBranch, GitCommit, Play, RotateCcw } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import { formatDuration, getTimeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DeploymentRowProps {
  commitSha: string;
  commitMessage?: string | null;
  gitBranch?: string | null;
  status: string;
  createdAt: number;
  finishedAt?: number | null;
  trigger?: string | null;
  selected: boolean;
  onClick: () => void;
  canRollback?: boolean;
  isRunning?: boolean;
  onRollback?: () => void;
  isRollingBack?: boolean;
  isCurrent?: boolean;
}

function getTriggerIcon(trigger: string | null | undefined) {
  switch (trigger) {
    case "git":
      return <GitCommit className="h-3 w-3" />;
    case "rollback":
      return <RotateCcw className="h-3 w-3" />;
    default:
      return <Play className="h-3 w-3" />;
  }
}

function getTriggerLabel(trigger: string | null | undefined): string {
  switch (trigger) {
    case "git":
      return "push";
    case "rollback":
      return "rollback";
    default:
      return "manual";
  }
}

export function DeploymentRow({
  commitSha,
  commitMessage,
  gitBranch,
  status,
  createdAt,
  finishedAt,
  trigger,
  selected,
  onClick,
  canRollback,
  isRunning,
  onRollback,
  isRollingBack,
  isCurrent,
}: DeploymentRowProps) {
  const date = new Date(createdAt);
  const timeAgo = getTimeAgo(date);
  const duration =
    finishedAt && createdAt ? formatDuration(createdAt, finishedAt) : null;
  const truncatedMessage = commitMessage
    ? commitMessage.split("\n")[0].slice(0, 50) +
      (commitMessage.length > 50 ? "..." : "")
    : null;

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
        "group w-full px-4 py-2.5 text-left transition-colors hover:bg-neutral-800/50 cursor-pointer",
        selected && "bg-neutral-800",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusDot status={status} />
          <span className="text-xs capitalize text-neutral-300 w-16 shrink-0">
            {status}
          </span>
          {gitBranch && (
            <span className="flex items-center gap-1 text-xs text-neutral-500 shrink-0">
              <GitBranch className="h-3 w-3" />
              <span className="max-w-20 truncate">{gitBranch}</span>
            </span>
          )}
          <span className="font-mono text-xs text-neutral-400 shrink-0">
            {commitSha.slice(0, 7)}
          </span>
          {truncatedMessage && (
            <span className="min-w-0 truncate text-xs text-neutral-500">
              {truncatedMessage}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
              <Check className="h-3 w-3" />
            </span>
          )}
          <span
            className="flex items-center gap-1 text-xs text-neutral-500"
            title={getTriggerLabel(trigger)}
          >
            {getTriggerIcon(trigger)}
          </span>
          {duration && (
            <span className="text-xs text-neutral-500 w-12 text-right">
              {duration}
            </span>
          )}
          <span className="text-xs text-neutral-500 w-14 text-right">
            {timeAgo}
          </span>
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
        </div>
      </div>
    </div>
  );
}
