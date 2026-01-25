"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { LogViewer } from "@/components/log-viewer";
import { SideDrawer } from "@/components/side-drawer";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/lib/api";

interface DeploymentLogsDrawerProps {
  deployment: Deployment | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DeploymentLogsDrawer({
  deployment,
  isOpen,
  onClose,
}: DeploymentLogsDrawerProps) {
  const buildLogLines = useMemo(() => {
    if (!deployment?.buildLog) return [];
    return deployment.buildLog.split("\n");
  }, [deployment?.buildLog]);

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      width="60vw"
      zIndex={40}
      fadeIn
    >
      {deployment && (
        <>
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-neutral-200">
                Deployment Logs
              </span>
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <StatusDot status={deployment.status} />
                <span className="font-mono">
                  {deployment.commitSha?.slice(0, 7) ||
                    deployment.id.slice(0, 7)}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex h-[calc(100%-57px)] flex-col">
            {deployment.errorMessage && (
              <div className="mx-4 mt-4 rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
                {deployment.errorMessage}
              </div>
            )}
            <LogViewer logs={buildLogLines} emptyMessage="No logs yet..." />
          </div>
        </>
      )}
    </SideDrawer>
  );
}
