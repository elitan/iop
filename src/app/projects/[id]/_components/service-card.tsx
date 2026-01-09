"use client";

import { ExternalLink, Loader2, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeployService } from "@/hooks/use-services";
import type { Service } from "@/lib/api";
import { cn } from "@/lib/utils";

function getGitHubOwnerFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+)/);
  return match ? match[1] : null;
}

interface ServiceCardProps {
  service: Service;
  projectId: string;
  serverIp: string | null;
  onDelete: () => void;
}

export function ServiceCard({
  service,
  projectId,
  serverIp,
  onDelete,
}: ServiceCardProps) {
  const deployMutation = useDeployService(service.id, projectId);

  async function handleDeploy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await deployMutation.mutateAsync();
      toast.success(`Deploying ${service.name}`);
    } catch {
      toast.error("Failed to start deployment");
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  }

  const deployment = service.latestDeployment;
  const isRunning = deployment?.status === "running";

  function getDisplayStatus(): string {
    if (!deployment) return "pending";
    if (deployment.status === "running") return "running";
    if (deployment.imageName) return "running";
    if (deployment.status === "failed") return "failed";
    return "building";
  }
  const status = getDisplayStatus();

  return (
    <Link href={`/projects/${projectId}/services/${service.id}`}>
      <Card
        className={cn(
          "cursor-pointer bg-neutral-900 border-neutral-800 transition-colors hover:border-neutral-700",
          isRunning && "border-l-2 border-l-green-500 hover:border-l-green-500",
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
            <div className="flex items-center gap-2">
              <StatusDot status={status} />
              <span>{service.name}</span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDeploy}
                disabled={deployMutation.isPending}
              >
                {deployMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5 text-neutral-500" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            {service.deployType === "repo" &&
              service.repoUrl &&
              getGitHubOwnerFromUrl(service.repoUrl) && (
                <img
                  src={`https://github.com/${getGitHubOwnerFromUrl(service.repoUrl)}.png?size=40`}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              )}
            <p className="truncate font-mono text-xs text-neutral-500">
              {service.deployType === "image"
                ? service.imageUrl
                : service.repoUrl?.replace("https://github.com/", "")}
            </p>
          </div>
          {isRunning && deployment?.hostPort && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                Port {deployment.hostPort}
              </span>
              {service.serviceType !== "database" && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(
                      `http://${serverIp || "localhost"}:${deployment.hostPort}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {deployment && !isRunning && (
            <p className="text-xs text-neutral-500">{deployment.commitSha}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
