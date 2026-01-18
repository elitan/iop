"use client";

import { ExternalLink, GitBranch, Github, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusDot } from "@/components/status-dot";
import { Card, CardContent } from "@/components/ui/card";
import type { Deployment, Domain, Service } from "@/lib/api";
import { api } from "@/lib/api";
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
  projectId: string;
  onDeploy: () => void;
}

export function SidebarOverview({ service, projectId }: SidebarOverviewProps) {
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [preferredDomain, setPreferredDomain] = useState<Domain | null>(null);
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(
    null,
  );

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
  }, []);

  useEffect(() => {
    if (!service.id) return;
    api.domains.list(service.id).then((domains) => {
      setPreferredDomain(getPreferredDomain(domains));
    });
  }, [service.id]);

  useEffect(() => {
    if (!service) return;
    async function fetchCurrentDeployment() {
      if (!service?.currentDeploymentId) {
        setCurrentDeployment(null);
        return;
      }
      const deps = await api.deployments.listByService(service.id);
      const current = deps.find((d) => d.id === service.currentDeploymentId);
      setCurrentDeployment(current ?? null);
    }
    fetchCurrentDeployment();
    const interval = setInterval(fetchCurrentDeployment, 2000);
    return () => clearInterval(interval);
  }, [service]);

  const githubRepo = getGitHubRepoFromUrl(service.repoUrl);

  if (!currentDeployment) {
    return (
      <Card className="bg-neutral-800 border-neutral-700">
        <CardContent className="py-8 text-center">
          <p className="text-neutral-500">No active deployment</p>
          <p className="mt-1 text-sm text-neutral-600">
            Click Deploy to create the first deployment
          </p>
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
    </div>
  );
}
