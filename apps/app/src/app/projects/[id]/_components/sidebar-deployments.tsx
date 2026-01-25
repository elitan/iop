"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useDeployments, useDeployService } from "@/hooks/use-services";
import type { Deployment, Service } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { DeploymentRow } from "../services/[serviceId]/_components/deployment-row";
import { DeploymentLogsDrawer } from "./deployment-logs-drawer";

interface SidebarDeploymentsProps {
  service: Service;
  onNestedDrawerChange?: (hasDrawer: boolean) => void;
}

export function SidebarDeployments({
  service,
  onNestedDrawerChange,
}: SidebarDeploymentsProps) {
  const { data: deployments = [] } = useDeployments(service.id);
  const deployMutation = useDeployService(service.id, service.environmentId);

  const [selectedDeployment, setSelectedDeployment] =
    useState<Deployment | null>(null);
  const selectedDeploymentRef = useRef<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

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
    setLogsOpen(true);
  }

  function handleCloseLogs() {
    setLogsOpen(false);
  }

  useEffect(() => {
    onNestedDrawerChange?.(logsOpen);
  }, [logsOpen, onNestedDrawerChange]);

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

      <DeploymentLogsDrawer
        deployment={selectedDeployment}
        isOpen={logsOpen}
        onClose={handleCloseLogs}
      />
    </div>
  );
}
