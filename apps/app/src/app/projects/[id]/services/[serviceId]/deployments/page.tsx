"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusDot } from "@/components/status-dot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeployments, useService } from "@/hooks/use-services";
import type { Deployment } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { DeploymentRow } from "../_components/deployment-row";

export default function ServiceDeploymentsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const { data: deployments = [] } = useDeployments(serviceId);

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

  if (!service) return null;

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-1">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-300">
              Deployments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {deployments.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No deployments"
                  description="Click Deploy to create one"
                />
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {deployments.map((d) => {
                  const hasVolumes =
                    service?.volumes && service.volumes !== "[]";
                  const canRollback =
                    !hasVolumes && !!d.imageName && d.rollbackEligible === 1;
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
          </CardContent>
        </Card>
      </div>

      <div className="col-span-2">
        {selectedDeployment && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
                <span>Build Logs</span>
                <StatusDot status={selectedDeployment.status} showLabel />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDeployment.errorMessage && (
                <div className="mb-4 rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
                  {selectedDeployment.errorMessage}
                </div>
              )}
              <pre className="max-h-96 overflow-auto rounded bg-neutral-950 p-4 font-mono text-xs text-neutral-400">
                {selectedDeployment.buildLog || "No logs yet..."}
              </pre>
              <p className="mt-3 text-xs text-neutral-500">
                Looking for container output?{" "}
                <Link
                  href={`/projects/${projectId}/services/${serviceId}/logs`}
                  className="text-neutral-400 underline hover:text-neutral-300"
                >
                  View runtime logs
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
