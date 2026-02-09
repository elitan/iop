"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { LogViewer } from "@/components/log-viewer";
import { SideDrawer } from "@/components/side-drawer";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { useBuildLogs } from "@/hooks/use-build-logs";
import type { Deployment } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";

interface DeploymentLogsDrawerProps {
  deployment: Deployment | null;
  isOpen: boolean;
  onClose: () => void;
}

function replicaStatusToDotStatus(
  status: string,
): "running" | "failed" | "pending" {
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "pending";
}

const ACTIVE_BUILD_STATUSES = new Set([
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
  "running",
]);

function shouldStreamBuildLogs(status: string): boolean {
  return ACTIVE_BUILD_STATUSES.has(status);
}

function ReplicaStatus({ deploymentId }: { deploymentId: string }) {
  const { data: replicas } = useQuery({
    ...orpc.deployments.getReplicas.queryOptions({
      input: { id: deploymentId },
    }),
    refetchInterval: 3000,
  });

  if (!replicas || replicas.length <= 1) return null;

  const running = replicas.filter((r) => r.status === "running").length;

  return (
    <div className="mx-4 mt-4 rounded border border-neutral-800 bg-neutral-900/50 p-3">
      <p className="mb-2 text-xs font-medium text-neutral-400">
        Replicas ({running}/{replicas.length} running)
      </p>
      <div className="space-y-1">
        {replicas.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 text-xs text-neutral-500"
          >
            <span className="w-4 text-neutral-400">{r.replicaIndex}</span>
            <StatusDot status={replicaStatusToDotStatus(r.status)} />
            {r.hostPort && <span className="font-mono">:{r.hostPort}</span>}
            {r.containerId && (
              <span className="font-mono text-neutral-600">
                {r.containerId.slice(0, 12)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeploymentLogsDrawer({
  deployment,
  isOpen,
  onClose,
}: DeploymentLogsDrawerProps) {
  const streamBuildLogs = deployment
    ? shouldStreamBuildLogs(deployment.status)
    : false;
  const { logs, isConnected, error } = useBuildLogs({
    deploymentId: deployment?.id ?? "",
    enabled: isOpen && !!deployment,
    shouldReconnect: streamBuildLogs,
  });
  const fallbackLogs = deployment?.buildLog?.split("\n") ?? [];
  const displayLogs = logs.length > 0 ? logs : fallbackLogs;

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
            <ReplicaStatus deploymentId={deployment.id} />
            <LogViewer
              logs={displayLogs}
              isStreaming={streamBuildLogs}
              isConnected={isConnected}
              error={error}
              emptyMessage="No logs yet..."
            />
          </div>
        </>
      )}
    </SideDrawer>
  );
}
