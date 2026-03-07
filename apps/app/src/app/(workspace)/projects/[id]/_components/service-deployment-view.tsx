"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DeploymentStatusIndicator } from "@/components/deployment-status-indicator";
import { LogViewer } from "@/components/log-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBuildLogs } from "@/hooks/use-build-logs";
import { useDeployments, useService } from "@/hooks/use-services";
import { orpc } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/time";

interface ServiceDeploymentViewProps {
  serviceId: string;
  deploymentId: string;
  onBack: () => void;
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

export function ServiceDeploymentView({
  serviceId,
  deploymentId,
  onBack,
}: ServiceDeploymentViewProps) {
  const { data: service } = useService(serviceId, { refetchInterval: 2000 });
  const { data: deployments = [] } = useDeployments(serviceId);
  const deployment =
    deployments.find(function findDeployment(candidate) {
      return candidate.id === deploymentId;
    }) ?? null;

  const streamBuildLogs = deployment
    ? shouldStreamBuildLogs(deployment.status)
    : false;

  const { logs, isConnected, error } = useBuildLogs({
    deploymentId,
    enabled: !!deployment,
    shouldReconnect: streamBuildLogs,
  });

  const { data: replicas = [] } = useQuery({
    ...orpc.deployments.getReplicas.queryOptions({
      input: { deploymentId },
    }),
    enabled: !!deployment,
    refetchInterval: 3000,
  });

  if (!service || !deployment) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md border-neutral-800 bg-neutral-900">
          <CardContent className="space-y-4 py-10 text-center">
            <p className="text-sm text-neutral-400">Deployment not found.</p>
            <Button size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fallbackLogs = deployment.buildLog?.split("\n") ?? [];
  const displayLogs = logs.length > 0 ? logs : fallbackLogs;
  const runningReplicas = replicas.filter(function isReplicaRunning(replica) {
    return replica.status === "running";
  }).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Button variant="ghost" size="sm" className="-ml-1" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-100">
            {service.name}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
            <DeploymentStatusIndicator status={deployment.status} />
            <span className="font-mono">
              {deployment.commitSha?.slice(0, 7) || deployment.id.slice(0, 7)}
            </span>
            <span>{getTimeAgo(new Date(deployment.createdAt))}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <DeploymentStatusIndicator status={deployment.status} showLabel />
            <span className="text-neutral-500">Build logs</span>
          </div>
          {replicas.length > 1 && (
            <p className="text-xs text-neutral-500">
              Replicas {runningReplicas}/{replicas.length} running
            </p>
          )}
        </div>

        {deployment.errorMessage && (
          <div className="mb-3 rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
            {deployment.errorMessage}
          </div>
        )}

        {replicas.length > 1 && (
          <div className="mb-3 rounded border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="space-y-1">
              {replicas.map(function renderReplica(replica) {
                return (
                  <div
                    key={replica.id}
                    className="flex items-center gap-3 text-xs text-neutral-500"
                  >
                    <span className="w-4 text-neutral-400">
                      {replica.replicaIndex}
                    </span>
                    <DeploymentStatusIndicator
                      status={replicaStatusToDotStatus(replica.status)}
                    />
                    {replica.hostPort && (
                      <span className="font-mono">:{replica.hostPort}</span>
                    )}
                    {replica.containerId && (
                      <span className="font-mono text-neutral-600">
                        {replica.containerId.slice(0, 12)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-800 bg-black">
          <LogViewer
            logs={displayLogs}
            isStreaming={streamBuildLogs}
            isConnected={isConnected}
            error={error}
            emptyMessage="No logs yet..."
          />
        </div>
      </div>
    </div>
  );
}
