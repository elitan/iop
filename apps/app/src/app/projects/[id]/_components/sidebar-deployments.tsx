"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { LogViewer } from "@/components/log-viewer";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { useDeployments, useDeployService } from "@/hooks/use-services";
import type { Deployment, Service } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { DeploymentRow } from "../services/[serviceId]/_components/deployment-row";

interface SidebarDeploymentsProps {
  service: Service;
}

export function SidebarDeployments({ service }: SidebarDeploymentsProps) {
  const { data: deployments = [] } = useDeployments(service.id);
  const deployMutation = useDeployService(service.id, service.environmentId);

  const [selectedDeployment, setSelectedDeployment] =
    useState<Deployment | null>(null);
  const selectedDeploymentRef = useRef<string | null>(null);

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      orpc.deployments.rollback.call({ id: deploymentId }),
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

  const buildLogLines = useMemo(() => {
    if (!selectedDeployment?.buildLog) return [];
    return selectedDeployment.buildLog.split("\n");
  }, [selectedDeployment?.buildLog]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-lg border border-neutral-700 bg-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <span className="text-sm font-medium text-neutral-300">
            Deployments
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              deployMutation.mutateAsync().then(() => {
                toast.success("Deployment started");
              });
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
          <div className="max-h-48 divide-y divide-neutral-700 overflow-auto">
            {deployments.map((d) => {
              const hasVolumes = service?.volumes && service.volumes !== "[]";
              const canRollback =
                !hasVolumes && !!d.imageName && d.rollbackEligible === true;
              const isCurrent = d.id === service.currentDeploymentId;
              return (
                <DeploymentRow
                  key={d.id}
                  id={d.id}
                  commitSha={d.commitSha}
                  status={d.status}
                  createdAt={d.createdAt}
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
                  imageName={d.imageName}
                />
              );
            })}
          </div>
        )}
      </div>

      {selectedDeployment && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
          <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-300">
                Deployment Logs
              </span>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <StatusDot status={selectedDeployment.status} />
                <span className="font-mono">
                  {selectedDeployment.commitSha?.slice(0, 7) ||
                    selectedDeployment.id.slice(0, 7)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {selectedDeployment.errorMessage && (
              <div className="mx-4 mt-4 rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
                {selectedDeployment.errorMessage}
              </div>
            )}
            <LogViewer logs={buildLogLines} emptyMessage="No logs yet..." />
          </div>
        </div>
      )}
    </div>
  );
}
