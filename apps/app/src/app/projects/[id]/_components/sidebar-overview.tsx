"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  Github,
  Globe,
  Loader2,
  Package,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useDomains } from "@/hooks/use-domains";
import { useDeployments, useDeployService } from "@/hooks/use-services";
import type { EnvVar, Service } from "@/lib/api";
import { api } from "@/lib/api";
import { buildConnectionString } from "@/lib/connection-strings";
import { getCurrentDeployment } from "@/lib/deployment-utils";
import { getPreferredDomain } from "@/lib/service-url";
import { getTimeAgo } from "@/lib/time";
import { ServiceMetricsCard } from "../services/[serviceId]/_components/service-metrics-card";

function getGitHubRepoFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

interface SidebarOverviewProps {
  service: Service;
}

export function SidebarOverview({ service }: SidebarOverviewProps) {
  const queryClient = useQueryClient();
  const deployMutation = useDeployService(service.id, service.environmentId);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
  });
  const serverIp = settings?.serverIp ?? null;

  const { data: domains = [] } = useDomains(service.id);
  const preferredDomain = getPreferredDomain(domains);

  const { data: deployments = [] } = useDeployments(service.id);
  const currentDeployment = getCurrentDeployment(service, deployments);

  const { data: tcpProxy } = useQuery({
    queryKey: ["tcp-proxy", service.id],
    queryFn: () => api.tcpProxy.get(service.id),
    enabled: service.serviceType === "database",
  });

  const enableTcpProxyMutation = useMutation({
    mutationFn: () => api.tcpProxy.enable(service.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", service.id] });
      toast.success("External access enabled", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
    },
    onError: () => toast.error("Failed to enable external access"),
  });

  const disableTcpProxyMutation = useMutation({
    mutationFn: () => api.tcpProxy.disable(service.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", service.id] });
      toast.success("External access disabled", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
    },
    onError: () => toast.error("Failed to disable external access"),
  });

  const githubRepo = getGitHubRepoFromUrl(service.repoUrl);

  if (!currentDeployment) {
    return (
      <Card className="border-blue-500/30 bg-blue-950/20">
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Rocket className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-neutral-200">Ready to deploy</p>
              <p className="mt-1 text-sm text-neutral-400">
                This service hasn&apos;t been deployed yet
              </p>
            </div>
            <Button
              onClick={() => deployMutation.mutateAsync()}
              disabled={deployMutation.isPending}
              className="w-full"
            >
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="mr-1.5 h-4 w-4" />
                  Deploy Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 ">
      <Card className="bg-neutral-800 border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <StatusDot status={currentDeployment.status} showLabel />
            {service.serviceType !== "database" &&
              (preferredDomain || currentDeployment.hostPort) && (
                <a
                  href={
                    preferredDomain
                      ? `https://${preferredDomain.domain}`
                      : `http://${serverIp || "localhost"}:${currentDeployment.hostPort}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                >
                  Open
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
          </div>

          {service.serviceType !== "database" &&
            (preferredDomain || currentDeployment.hostPort) && (
              <a
                href={
                  preferredDomain
                    ? `https://${preferredDomain.domain}`
                    : `http://${serverIp || "localhost"}:${currentDeployment.hostPort}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-sm text-blue-400 hover:text-blue-300 truncate mb-3"
              >
                {preferredDomain
                  ? preferredDomain.domain
                  : `${serverIp || "localhost"}:${currentDeployment.hostPort}`}
              </a>
            )}

          {service.deployType === "repo" && githubRepo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-400 mb-2">
              <Github className="h-3.5 w-3.5" />
              {githubRepo}
            </span>
          )}

          {service.deployType === "image" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-400 mb-2">
              <Package className="h-3.5 w-3.5" />
              {service.imageUrl}
            </span>
          )}

          {service.deployType === "repo" && currentDeployment.commitSha && (
            <div className="mb-2">
              {githubRepo ? (
                <a
                  href={`https://github.com/${githubRepo}/commit/${currentDeployment.commitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-500 hover:text-neutral-300"
                >
                  {currentDeployment.commitSha}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-mono text-xs text-neutral-500">
                  {currentDeployment.commitSha}
                </span>
              )}
              {currentDeployment.commitMessage && (
                <p className="mt-1 text-sm text-neutral-400">
                  {currentDeployment.commitMessage}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span>
              Deployed {getTimeAgo(new Date(currentDeployment.createdAt))}
            </span>
            {service.deployType === "repo" && (
              <>
                <span>on</span>
                <GitBranch className="h-3 w-3" />
                <span>{service.branch || "main"}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ServiceMetricsCard serviceId={service.id} />

      {service.serviceType === "database" && currentDeployment && (
        <Card className="bg-neutral-800 border-neutral-700">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-neutral-300">
              <Database className="h-4 w-4" />
              Database Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-neutral-500">
                Internal Connection (within project)
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300 overflow-auto">
                  {buildConnectionString(
                    service.imageUrl?.split(":")[0] ?? "",
                    service.name,
                    service.containerPort ?? 5432,
                    JSON.parse(service.envVars || "[]").reduce(
                      (acc: Record<string, string>, v: EnvVar) => {
                        acc[v.key] = v.value;
                        return acc;
                      },
                      {},
                    ),
                  )}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      buildConnectionString(
                        service.imageUrl?.split(":")[0] ?? "",
                        service.name,
                        service.containerPort ?? 5432,
                        JSON.parse(service.envVars || "[]").reduce(
                          (acc: Record<string, string>, v: EnvVar) => {
                            acc[v.key] = v.value;
                            return acc;
                          },
                          {},
                        ),
                      ),
                    );
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="border-t border-neutral-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="flex items-center gap-2 text-sm text-neutral-300">
                    <Globe className="h-4 w-4" />
                    External Access
                  </span>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Expose database to external connections
                  </p>
                </div>
                <Switch
                  checked={tcpProxy?.enabled ?? false}
                  disabled={
                    enableTcpProxyMutation.isPending ||
                    disableTcpProxyMutation.isPending
                  }
                  onCheckedChange={(checked: boolean) => {
                    if (checked) {
                      enableTcpProxyMutation.mutate();
                    } else {
                      disableTcpProxyMutation.mutate();
                    }
                  }}
                />
              </div>

              {tcpProxy?.enabled && tcpProxy.port && serverIp && (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-neutral-500">
                    External Connection
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300 overflow-auto">
                      {buildConnectionString(
                        service.imageUrl?.split(":")[0] ?? "",
                        serverIp,
                        tcpProxy.port,
                        JSON.parse(service.envVars || "[]").reduce(
                          (acc: Record<string, string>, v: EnvVar) => {
                            acc[v.key] = v.value;
                            return acc;
                          },
                          {},
                        ),
                      )}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          buildConnectionString(
                            service.imageUrl?.split(":")[0] ?? "",
                            serverIp,
                            tcpProxy.port!,
                            JSON.parse(service.envVars || "[]").reduce(
                              (acc: Record<string, string>, v: EnvVar) => {
                                acc[v.key] = v.value;
                                return acc;
                              },
                              {},
                            ),
                          ),
                        );
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
