"use client";

import { useEffect, useState } from "react";
import { useService } from "@/hooks/use-services";
import { FALLBACK_ICON, getServiceIcon } from "@/lib/service-logo";
import {
  type CoreSidebarTab,
  ResourceSidebarCore,
} from "./resource-sidebar-core";
import { SidebarDeployments } from "./sidebar-deployments";
import { SidebarLogs } from "./sidebar-logs";
import { SidebarOverview } from "./sidebar-overview";
import { SidebarSettings } from "./sidebar-settings";

interface ServiceSidebarProps {
  projectId: string;
  serviceId: string | null;
  onClose: () => void;
  onOpenDeploymentPage?: (deploymentId: string) => void;
  initialTab?: CoreSidebarTab;
}

export function ServiceSidebar({
  projectId,
  serviceId,
  onClose,
  onOpenDeploymentPage,
  initialTab,
}: ServiceSidebarProps) {
  const [activeTab, setActiveTab] = useState<CoreSidebarTab>(
    initialTab ?? "overview",
  );
  const { data: service } = useService(serviceId || "", {
    refetchInterval: activeTab === "settings" ? false : 2000,
  });

  useEffect(
    function syncInitialTab() {
      setActiveTab(initialTab ?? "overview");
    },
    [initialTab],
  );

  return (
    service && (
      <ResourceSidebarCore
        isOpen={!!serviceId}
        onClose={onClose}
        title={service.name}
        resetKey={service.id}
        initialTab={initialTab}
        onActiveTabChange={(tab) => {
          if (
            tab === "overview" ||
            tab === "deployments" ||
            tab === "logs" ||
            tab === "settings"
          ) {
            setActiveTab(tab);
          }
        }}
        icon={
          <img
            src={getServiceIcon(service) ?? FALLBACK_ICON}
            alt=""
            className="h-4 w-4 object-contain"
          />
        }
        coreSections={{
          overview: <SidebarOverview service={service} />,
          deployments: (
            <SidebarDeployments
              service={service}
              onOpenDeploymentPage={onOpenDeploymentPage}
            />
          ),
          logs: <SidebarLogs service={service} />,
          settings: <SidebarSettings service={service} projectId={projectId} />,
        }}
      ></ResourceSidebarCore>
    )
  );
}
