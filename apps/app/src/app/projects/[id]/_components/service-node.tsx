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

  return (
    <>
      <Handle type="target" position={Position.Left} className="invisible" />
      <Card
        className={cn(
          "w-64 cursor-pointer bg-neutral-900 border-neutral-800 transition-colors",
          isSelected
            ? "border-blue-500 ring-1 ring-blue-500"
            : "hover:border-neutral-700",
        )}
      >
        <CardContent className="flex flex-col p-4">
          <ServiceContent service={service} url={url} truncateImage />
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} className="invisible" />
    </>
  );
}
