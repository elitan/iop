"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { GitBranch, Github, Package } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import { Card, CardContent } from "@/components/ui/card";
import type { Service } from "@/lib/api";
import { getTimeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

function getGitHubRepoFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

function getKnownServiceLogo(service: Service): string | null {
  const imageUrl = service.imageUrl?.toLowerCase() || "";
  const name = service.name.toLowerCase();

  if (
    imageUrl.includes("postgres") ||
    name.includes("postgres") ||
    name.includes("pg")
  ) {
    return "https://www.postgresql.org/media/img/about/press/elephant.png";
  }
  if (imageUrl.includes("redis") || name.includes("redis")) {
    return "https://cdn.simpleicons.org/redis/DC382D";
  }
  if (imageUrl.includes("mysql") || name.includes("mysql")) {
    return "https://cdn.simpleicons.org/mysql/4479A1";
  }
  if (imageUrl.includes("mongo") || name.includes("mongo")) {
    return "https://cdn.simpleicons.org/mongodb/47A248";
  }
  if (imageUrl.includes("mariadb") || name.includes("mariadb")) {
    return "https://cdn.simpleicons.org/mariadb/003545";
  }
  if (imageUrl.includes("nginx") || name.includes("nginx")) {
    return "https://cdn.simpleicons.org/nginx/009639";
  }
  if (imageUrl.includes("node") || name.includes("node")) {
    return "https://cdn.simpleicons.org/nodedotjs/339933";
  }
  if (imageUrl.includes("python") || name.includes("python")) {
    return "https://cdn.simpleicons.org/python/3776AB";
  }
  if (imageUrl.includes("rabbitmq") || name.includes("rabbitmq")) {
    return "https://cdn.simpleicons.org/rabbitmq/FF6600";
  }
  if (imageUrl.includes("elasticsearch") || name.includes("elastic")) {
    return "https://cdn.simpleicons.org/elasticsearch/005571";
  }
  if (imageUrl.includes("minio") || name.includes("minio")) {
    return "https://cdn.simpleicons.org/minio/C72E49";
  }

  return null;
}

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
  const githubRepo = getGitHubRepoFromUrl(service.repoUrl);
  const knownLogo = getKnownServiceLogo(service);

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
          <div className="flex items-start gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              {knownLogo ? (
                <img
                  src={knownLogo}
                  alt=""
                  className="h-5 w-5 object-contain"
                />
              ) : (
                <span className="text-sm font-semibold text-neutral-300">
                  {service.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-medium text-neutral-200">{service.name}</p>
                <StatusDot status={deployment?.status || "pending"} />
              </div>
              {url && service.serviceType !== "database" && (
                <p className="text-xs text-neutral-500 truncate">{url}</p>
              )}
            </div>
          </div>

          {service.deployType === "repo" && githubRepo && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 mb-2">
              <Github className="h-3 w-3" />
              {githubRepo}
            </span>
          )}

          {service.deployType === "image" && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 mb-2">
              <Package className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{service.imageUrl}</span>
            </span>
          )}

          {deployment?.commitMessage && (
            <p className="text-sm text-neutral-400 line-clamp-1 mb-2">
              {deployment.commitMessage}
            </p>
          )}

          {deployment && (
            <div className="flex items-center gap-1 text-xs text-neutral-500 mt-auto">
              <span>{getTimeAgo(new Date(deployment.createdAt))}</span>
              {service.deployType === "repo" && (
                <>
                  <span>on</span>
                  <GitBranch className="h-3 w-3" />
                  <span>{service.branch || "main"}</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} className="invisible" />
    </>
  );
}
