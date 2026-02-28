"use client";

import { GitBranch, Github, Package } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import type { Service } from "@/lib/api";
import { FALLBACK_ICON, getServiceIcon } from "@/lib/service-logo";
import { getGitHubRepoFromUrl } from "@/lib/service-url";
import { getTimeAgo } from "@/lib/time";

interface ServiceContentProps {
  service: Service;
  url: string | null;
  truncateImage?: boolean;
}

export function ServiceContent({
  service,
  url,
  truncateImage,
}: ServiceContentProps) {
  const deployment = service.latestDeployment;
  const githubRepo = getGitHubRepoFromUrl(service.repoUrl);
  const serviceIcon = getServiceIcon(service) ?? FALLBACK_ICON;

  return (
    <>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
          <img src={serviceIcon} alt="" className="h-5 w-5 object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-medium text-neutral-200">{service.name}</p>
            <div className="flex items-center gap-1.5">
              <StatusDot status={deployment?.status || "pending"} />
              {(service.replicaCount ?? 1) > 1 && (
                <span className="text-[10px] font-medium text-neutral-500">
                  ×{service.replicaCount}
                </span>
              )}
            </div>
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
          {truncateImage ? (
            <span className="truncate max-w-[180px]">{service.imageUrl}</span>
          ) : (
            service.imageUrl
          )}
        </span>
      )}

      {deployment?.commitMessage && (
        <p className="text-sm text-neutral-400 line-clamp-1 mb-2">
          {deployment.commitMessage}
        </p>
      )}

      {deployment && (
        <div className="flex items-center gap-1 text-xs text-neutral-500 mt-auto min-w-0">
          <span className="shrink-0">
            {getTimeAgo(new Date(deployment.createdAt))}
          </span>
          {service.deployType === "repo" && (
            <>
              <span className="shrink-0">on</span>
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{service.branch || "main"}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
