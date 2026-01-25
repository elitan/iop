import { GitBranch, GitCommit, RotateCcw } from "lucide-react";
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
  triggeredByUsername?: string | null;
  triggeredByAvatarUrl?: string | null;
  selected: boolean;
  onClick: () => void;
  canRollback?: boolean;
  isRunning?: boolean;
  onRollback?: () => void;
  isRollingBack?: boolean;
  isCurrent?: boolean;
}

function isInProgress(status: string): boolean {
  return ["pending", "cloning", "pulling", "building", "deploying"].includes(
    status,
  );
}

interface TriggerLabelProps {
  trigger?: string | null;
  gitBranch?: string | null;
}

function TriggerLabel({
  trigger,
  gitBranch,
}: TriggerLabelProps): React.ReactNode {
  if (trigger === "rollback") {
    return (
      <>
        <RotateCcw className="h-3.5 w-3.5 text-neutral-500" />
        <span>Rollback</span>
      </>
    );
  }
  if (gitBranch) {
    return (
      <>
        <GitBranch className="h-3.5 w-3.5 text-neutral-500" />
        <span className="truncate max-w-32">{gitBranch}</span>
      </>
    );
  }
  return <span className="text-neutral-500">Manual deploy</span>;
}

export function DeploymentRow({
  commitSha,
  commitMessage,
  gitBranch,
  status,
  createdAt,
  finishedAt,
  trigger,
  triggeredByUsername,
  triggeredByAvatarUrl,
  selected,
  onClick,
  canRollback,
  isRunning,
  onRollback,
  isRollingBack,
  isCurrent,
}: DeploymentRowProps) {
  const timeAgo = getTimeAgo(new Date(createdAt));
  const duration =
    finishedAt && createdAt ? formatDuration(createdAt, finishedAt) : null;
  const inProgress = isInProgress(status);
  const elapsed = inProgress ? formatDuration(createdAt, Date.now()) : null;

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
      <div className="flex items-center gap-4">
        <div className="w-20 shrink-0">
          <div className="flex items-center gap-2">
            <StatusDot status={status} showLabel />
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {inProgress ? elapsed : duration}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm text-neutral-300">
            <TriggerLabel trigger={trigger} gitBranch={gitBranch} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-0.5">
            <GitCommit className="h-3 w-3" />
            <span className="font-mono">{commitSha.slice(0, 7)}</span>
            {commitMessage && (
              <span className="truncate">{commitMessage.split("\n")[0]}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isCurrent && (
            <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
              Current
            </span>
          )}
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>
              {timeAgo}
              {triggeredByUsername && ` by ${triggeredByUsername}`}
            </span>
            {triggeredByAvatarUrl && (
              <img
                src={triggeredByAvatarUrl}
                alt={triggeredByUsername || ""}
                className="h-5 w-5 rounded-full"
              />
            )}
          </div>
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
