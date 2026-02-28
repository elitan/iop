"use client";

import { Circle } from "lucide-react";
import type { ReactNode } from "react";
import { LogViewer } from "@/components/log-viewer";
import { cn } from "@/lib/utils";

interface RuntimeLogsPanelProps {
  logs: string[];
  isConnected: boolean;
  error: string | null;
  headerPrefix?: ReactNode;
  headerSuffix?: ReactNode;
  emptyMessage?: string;
  className?: string;
  viewerClassName?: string;
}

export function RuntimeLogsPanel({
  logs,
  isConnected,
  error,
  headerPrefix,
  headerSuffix,
  emptyMessage = "Waiting for logs...",
  className,
  viewerClassName,
}: RuntimeLogsPanelProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-3 flex items-center gap-2">
        {headerPrefix}
        <Circle
          className={cn(
            "h-2 w-2",
            isConnected
              ? "fill-green-500 text-green-500"
              : "fill-neutral-500 text-neutral-500",
          )}
        />
        <span className="text-xs text-neutral-500">
          {isConnected ? "Live" : "Reconnecting..."}
        </span>
        {headerSuffix ? <div className="ml-auto">{headerSuffix}</div> : null}
      </div>

      <LogViewer
        logs={logs}
        error={error}
        emptyMessage={emptyMessage}
        className={viewerClassName}
      />
    </div>
  );
}
