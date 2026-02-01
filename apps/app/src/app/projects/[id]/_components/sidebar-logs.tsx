"use client";

import { useQuery } from "@tanstack/react-query";
import { Circle } from "lucide-react";
import { useState } from "react";
import { LogViewer } from "@/components/log-viewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRuntimeLogs } from "@/hooks/use-runtime-logs";
import type { Service } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

interface SidebarLogsProps {
  service: Service;
}

function RuntimeLogsContent({
  deploymentId,
  replicaCount,
}: {
  deploymentId: string;
  replicaCount: number;
}) {
  const [selectedReplica, setSelectedReplica] = useState<string>("all");
  const replica =
    selectedReplica === "all" ? undefined : parseInt(selectedReplica, 10);
  const { logs, isConnected, error } = useRuntimeLogs({
    deploymentId,
    replica,
  });

  const { data: replicas } = useQuery({
    ...orpc.deployments.getReplicas.queryOptions({
      input: { id: deploymentId },
    }),
    enabled: replicaCount > 1,
  });

  const showFilter = replicaCount > 1 && replicas && replicas.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
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
        {showFilter && (
          <Select value={selectedReplica} onValueChange={setSelectedReplica}>
            <SelectTrigger className="ml-auto h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All replicas</SelectItem>
              {replicas.map((r) => (
                <SelectItem key={r.replicaIndex} value={String(r.replicaIndex)}>
                  Replica {r.replicaIndex}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <LogViewer logs={logs} error={error} emptyMessage="Waiting for logs..." />
    </div>
  );
}

export function SidebarLogs({ service }: SidebarLogsProps) {
  if (!service.currentDeploymentId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-500">No active deployment</p>
          <p className="mt-1 text-sm text-neutral-600">
            Deploy the service to view runtime logs
          </p>
        </div>
      </div>
    );
  }

  return (
    <RuntimeLogsContent
      deploymentId={service.currentDeploymentId}
      replicaCount={service.replicaCount ?? 1}
    />
  );
}
