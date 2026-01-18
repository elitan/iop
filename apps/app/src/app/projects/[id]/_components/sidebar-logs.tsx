"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Service } from "@/lib/api";
import { RuntimeLogs } from "../services/[serviceId]/_components/runtime-logs";

interface SidebarLogsProps {
  service: Service;
}

export function SidebarLogs({ service }: SidebarLogsProps) {
  if (!service.currentDeploymentId) {
    return (
      <Card className="bg-neutral-800 border-neutral-700">
        <CardContent className="py-8 text-center">
          <p className="text-neutral-500">No active deployment</p>
          <p className="mt-1 text-sm text-neutral-600">
            Deploy the service to view runtime logs
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="">
      <Card className="bg-neutral-800 border-neutral-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            Runtime Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RuntimeLogs deploymentId={service.currentDeploymentId} />
        </CardContent>
      </Card>
    </div>
  );
}
