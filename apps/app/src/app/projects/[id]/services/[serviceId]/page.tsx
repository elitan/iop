"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  Github,
  Globe,
  Package,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useDeployService, useService } from "@/hooks/use-services";
import type { Deployment, Domain, EnvVar, Service } from "@/lib/api";
import { api } from "@/lib/api";
import { buildConnectionString } from "@/lib/connection-strings";
import { getPreferredDomain } from "@/lib/service-url";
import { getTimeAgo } from "@/lib/time";
import { ServiceMetricsCard } from "./_components/service-metrics-card";

function parseEnvVarsToRecord(envVarsJson: string): Record<string, string> {
  const envVars: EnvVar[] = JSON.parse(envVarsJson);
  return envVars.reduce<Record<string, string>>((acc, v) => {
    acc[v.key] = v.value;
    return acc;
  }, {});
}

function getConnectionString(
  service: Service,
  host: string,
  port: number,
): string {
  const imageBase = service.imageUrl?.split(":")[0] ?? "";
  const envRecord = parseEnvVarsToRecord(service.envVars);
  return buildConnectionString(imageBase, host, port, envRecord);
}

interface ConnectionStringDisplayProps {
  label: string;
  connectionString: string;
}

function ConnectionStringDisplay({
  label,
  connectionString,
}: ConnectionStringDisplayProps) {
  return (
    <div>
      <p className="mb-1 text-xs text-neutral-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-300">
          {connectionString}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(connectionString);
            toast.success("Copied to clipboard");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function getGitHubRepoFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

function getKnownServiceLogo(
  imageUrl: string | null,
  name: string,
): string | null {
  const img = imageUrl?.toLowerCase() || "";
  const n = name.toLowerCase();

  if (img.includes("postgres") || n.includes("postgres") || n.includes("pg")) {
    return "https://www.postgresql.org/media/img/about/press/elephant.png";
  }
  if (img.includes("redis") || n.includes("redis")) {
    return "https://cdn.simpleicons.org/redis/DC382D";
  }
  if (img.includes("mysql") || n.includes("mysql")) {
    return "https://cdn.simpleicons.org/mysql/4479A1";
  }
  if (img.includes("mongo") || n.includes("mongo")) {
    return "https://cdn.simpleicons.org/mongodb/47A248";
  }
  if (img.includes("mariadb") || n.includes("mariadb")) {
    return "https://cdn.simpleicons.org/mariadb/003545";
  }
  if (img.includes("nginx") || n.includes("nginx")) {
    return "https://cdn.simpleicons.org/nginx/009639";
  }
  if (img.includes("node") || n.includes("node")) {
    return "https://cdn.simpleicons.org/nodedotjs/339933";
  }
  if (img.includes("python") || n.includes("python")) {
    return "https://cdn.simpleicons.org/python/3776AB";
  }
  if (img.includes("rabbitmq") || n.includes("rabbitmq")) {
    return "https://cdn.simpleicons.org/rabbitmq/FF6600";
  }
  if (img.includes("elasticsearch") || n.includes("elastic")) {
    return "https://cdn.simpleicons.org/elasticsearch/005571";
  }
  if (img.includes("minio") || n.includes("minio")) {
    return "https://cdn.simpleicons.org/minio/C72E49";
  }

  return null;
}

export default function ServiceOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const deployMutation = useDeployService(serviceId, projectId);
  const queryClient = useQueryClient();

  const [serverIp, setServerIp] = useState<string | null>(null);
  const [preferredDomain, setPreferredDomain] = useState<Domain | null>(null);
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(
    null,
  );

  const { data: tcpProxy } = useQuery({
    queryKey: ["tcp-proxy", serviceId],
    queryFn: () => api.tcpProxy.get(serviceId),
    enabled: service?.serviceType === "database",
  });

  const enableTcpProxyMutation = useMutation({
    mutationFn: () => api.tcpProxy.enable(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", serviceId] });
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
    mutationFn: () => api.tcpProxy.disable(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", serviceId] });
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

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    api.domains.list(serviceId).then((domains) => {
      setPreferredDomain(getPreferredDomain(domains));
    });
  }, [serviceId]);

  useEffect(() => {
    if (!service) return;
    async function fetchCurrentDeployment() {
      if (!service?.currentDeploymentId) {
        setCurrentDeployment(null);
        return;
      }
      const deps = await api.deployments.listByService(serviceId);
      const current = deps.find((d) => d.id === service.currentDeploymentId);
      setCurrentDeployment(current ?? null);
    }
    fetchCurrentDeployment();
    const interval = setInterval(fetchCurrentDeployment, 2000);
    return () => clearInterval(interval);
  }, [service, serviceId]);

  if (!service) return null;

  return (
    <div className="space-y-6">
      {currentDeployment && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
                {getKnownServiceLogo(service.imageUrl, service.name) ? (
                  <img
                    src={getKnownServiceLogo(service.imageUrl, service.name)!}
                    alt=""
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  <span className="text-base font-semibold text-neutral-300">
                    {service.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <StatusDot status={currentDeployment.status} showLabel />
                  {service.serviceType !== "database" && (
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
                {service.serviceType !== "database" && (
                  <a
                    href={
                      preferredDomain
                        ? `https://${preferredDomain.domain}`
                        : `http://${serverIp || "localhost"}:${currentDeployment.hostPort}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-sm text-blue-400 hover:text-blue-300 truncate"
                  >
                    {preferredDomain
                      ? preferredDomain.domain
                      : `${serverIp || "localhost"}:${currentDeployment.hostPort}`}
                  </a>
                )}
              </div>
            </div>

            {service.deployType === "repo" &&
              getGitHubRepoFromUrl(service.repoUrl) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 mb-2">
                  <Github className="h-3.5 w-3.5" />
                  {getGitHubRepoFromUrl(service.repoUrl)}
                </span>
              )}

            {service.deployType === "image" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 mb-2">
                <Package className="h-3.5 w-3.5" />
                {service.imageUrl}
              </span>
            )}

            {service.deployType === "repo" && currentDeployment.commitSha && (
              <div className="mb-2">
                {getGitHubRepoFromUrl(service.repoUrl) ? (
                  <a
                    href={`https://github.com/${getGitHubRepoFromUrl(service.repoUrl)}/commit/${currentDeployment.commitSha}`}
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
      )}

      {currentDeployment && <ServiceMetricsCard serviceId={serviceId} />}

      {service.serviceType === "database" && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-neutral-300">
              <Database className="h-4 w-4" />
              Database Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentDeployment ? (
              <>
                <ConnectionStringDisplay
                  label="Internal Connection (within project)"
                  connectionString={getConnectionString(
                    service,
                    service.name,
                    service.containerPort ?? 5432,
                  )}
                />

                <div className="border-t border-neutral-800 pt-4">
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
                      <ConnectionStringDisplay
                        label="External Connection"
                        connectionString={getConnectionString(
                          service,
                          serverIp,
                          tcpProxy.port,
                        )}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                Deploy the database to view connection details.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!currentDeployment && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="py-12 text-center">
            <p className="text-neutral-500">No active deployment</p>
            <p className="mt-1 text-sm text-neutral-600">
              Click Deploy to create the first deployment
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
