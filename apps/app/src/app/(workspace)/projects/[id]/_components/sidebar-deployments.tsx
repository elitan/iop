"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DeploymentStatusIndicator } from "@/components/deployment-status-indicator";
import { EmptyState } from "@/components/empty-state";
import { LogViewer } from "@/components/log-viewer";
import { Button } from "@/components/ui/button";
import { useBuildLogs } from "@/hooks/use-build-logs";
import { useDeployments, useDeployService } from "@/hooks/use-services";
import type { Deployment, Service } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { DeploymentRow } from "../services/[serviceId]/_components/deployment-row";

interface SidebarDeploymentsProps {
  service: Service;
  onOpenDeploymentPage?: (deploymentId: string) => void;
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
      input: { deploymentId },
    }),
    refetchInterval: 3000,
  });

  if (!replicas || replicas.length <= 1) return null;

  const running = replicas.filter((r) => r.status === "running").length;

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/50 p-3">
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
            <DeploymentStatusIndicator
              status={replicaStatusToDotStatus(r.status)}
            />
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

export function SidebarDeployments({
  service,
  onOpenDeploymentPage,
}: SidebarDeploymentsProps) {
  const { data: deployments = [] } = useDeployments(service.id);
  const deployMutation = useDeployService(service.id, service.environmentId);

  const [selectedDeployment, setSelectedDeployment] =
    useState<Deployment | null>(null);
  const selectedDeploymentRef = useRef<string | null>(null);

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      orpc.deployments.rollback.call({ deploymentId }),
    onSuccess: () => {
      toast.success("Rollback started");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    },
  });

  useEffect(() => {
    if (deployments.length === 0) {
      setSelectedDeployment(null);
      return;
    }
    if (!selectedDeploymentRef.current) {
      setSelectedDeployment(deployments[0]);
      selectedDeploymentRef.current = deployments[0].id;
    } else {
      const updated = deployments.find(
        (d) => d.id === selectedDeploymentRef.current,
      );
      if (updated) setSelectedDeployment(updated);
    }
  }, [deployments]);

  function handleSelectDeployment(d: Deployment) {
    setSelectedDeployment(d);
    selectedDeploymentRef.current = d.id;
  }

  const streamBuildLogs = selectedDeployment
    ? shouldStreamBuildLogs(selectedDeployment.status)
    : false;
  const { logs, isConnected, error } = useBuildLogs({
    deploymentId: selectedDeployment?.id ?? "",
    enabled: !!selectedDeployment,
    shouldReconnect: streamBuildLogs,
  });
  const fallbackLogs = selectedDeployment?.buildLog?.split("\n") ?? [];
  const displayLogs = logs.length > 0 ? logs : fallbackLogs;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-700 bg-neutral-800">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
          <span className="text-sm font-medium text-neutral-300">
            Deployments
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await deployMutation.mutateAsync();
              toast.success("Deployment started");
            }}
            disabled={deployMutation.isPending}
          >
            {deployMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Deploying
              </>
            ) : (
              <>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                Redeploy
              </>
            )}
          </Button>
        </div>
        {deployments.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No deployments"
              description="Click Deploy to create one"
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-neutral-700 overflow-auto">
            {deployments.map((d) => {
              const hasVolumes = service.volumes && service.volumes !== "[]";
              const canRollback =
                !hasVolumes && !!d.imageName && d.rollbackEligible === true;
              const isCurrent = d.id === service.currentDeploymentId;
              return (
                <DeploymentRow
                  key={d.id}
                  commitSha={d.commitSha}
                  commitMessage={d.commitMessage}
                  gitBranch={d.gitBranch}
                  status={d.status}
                  createdAt={d.createdAt}
                  finishedAt={d.finishedAt}
                  trigger={d.trigger}
                  triggeredByUsername={d.triggeredByUsername}
                  triggeredByAvatarUrl={d.triggeredByAvatarUrl}
                  selected={selectedDeployment?.id === d.id}
                  onClick={() => handleSelectDeployment(d)}
                  canRollback={canRollback}
                  isRunning={isCurrent}
                  onRollback={() => rollbackMutation.mutate(d.id)}
                  isRollingBack={
                    rollbackMutation.isPending &&
                    rollbackMutation.variables === d.id
                  }
                  isCurrent={isCurrent}
                />
              );
            })}
          </div>
        )}
      </div>

      {selectedDeployment && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-700 bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-200">Logs</span>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <DeploymentStatusIndicator status={selectedDeployment.status} />
                <span className="font-mono">
                  {selectedDeployment.commitSha?.slice(0, 7) ||
                    selectedDeployment.id.slice(0, 7)}
                </span>
              </div>
            </div>
            {onOpenDeploymentPage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={function openDeploymentPage() {
                  onOpenDeploymentPage(selectedDeployment.id);
                }}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open page
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 p-4">
            {selectedDeployment.errorMessage && (
              <div className="rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
                {selectedDeployment.errorMessage}
              </div>
            )}
            <ReplicaStatus deploymentId={selectedDeployment.id} />
            <div className="min-h-0 flex-1 overflow-hidden rounded border border-neutral-800">
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
      )}
    </div>
  );
}
