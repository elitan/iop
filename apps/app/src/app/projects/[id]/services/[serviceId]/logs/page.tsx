"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useService } from "@/hooks/use-services";
import type { Deployment } from "@/lib/api";
import { api } from "@/lib/api";
import { RuntimeLogs } from "../_components/runtime-logs";

export default function ServiceLogsPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(
    null,
  );

  useEffect(() => {
    if (!service?.currentDeploymentId) {
      setCurrentDeployment(null);
      return;
    }
    async function fetchCurrentDeployment() {
      const deps = await api.deployments.listByService(serviceId);
      const current = deps.find((d) => d.id === service?.currentDeploymentId);
      setCurrentDeployment(current ?? null);
    }
    fetchCurrentDeployment();
  }, [service, serviceId]);

  if (!service) return null;

  if (!currentDeployment) {
    return (
      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="py-12 text-center">
          <p className="text-neutral-500">No running deployment</p>
          <p className="mt-1 text-sm text-neutral-600">
            Runtime logs are only available when a deployment is running
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-300">
          Runtime Logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RuntimeLogs deploymentId={currentDeployment.id} />
      </CardContent>
    </Card>
  );
}
