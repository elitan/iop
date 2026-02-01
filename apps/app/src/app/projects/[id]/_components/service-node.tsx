"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import type { Service } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ServiceContent } from "./service-content";

export type ServiceNodeData = {
  service: Service;
  domain: string | null;
  serverIp: string | null;
  isSelected: boolean;
  [key: string]: unknown;
};

export type ServiceNodeType = Node<ServiceNodeData, "service">;

export function ServiceNode({ data }: NodeProps<ServiceNodeType>) {
  const { service, domain, serverIp, isSelected } = data;
  const deployment = service.latestDeployment;
  const url =
    domain ||
    (serverIp && deployment?.hostPort
      ? `${serverIp}:${deployment.hostPort}`
      : null);

  const replicaCount = service.replicaCount ?? 1;

  return (
    <>
      <Handle type="target" position={Position.Left} className="invisible" />
      <div className="relative">
        {replicaCount >= 3 && (
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-neutral-800 bg-neutral-900 opacity-30" />
        )}
        {replicaCount >= 2 && (
          <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border border-neutral-800 bg-neutral-900 opacity-50" />
        )}
        <Card
          className={cn(
            "relative w-64 cursor-pointer bg-neutral-900 border-neutral-800 transition-colors",
            isSelected
              ? "border-blue-500 ring-1 ring-blue-500"
              : "hover:border-neutral-700",
          )}
        >
          <CardContent className="flex flex-col p-4">
            <ServiceContent service={service} url={url} truncateImage />
          </CardContent>
        </Card>
      </div>
      <Handle type="source" position={Position.Right} className="invisible" />
    </>
  );
}
