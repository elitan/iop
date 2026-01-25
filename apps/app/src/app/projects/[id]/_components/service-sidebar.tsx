"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { StateTabs } from "@/components/state-tabs";
import { Button } from "@/components/ui/button";
import { useService } from "@/hooks/use-services";
import { FALLBACK_ICON, getServiceIcon } from "@/lib/service-logo";
import { cn } from "@/lib/utils";
import { SidebarDeployments } from "./sidebar-deployments";
import { SidebarLogs } from "./sidebar-logs";
import { SidebarOverview } from "./sidebar-overview";
import { SidebarSettings } from "./sidebar-settings";

interface ServiceSidebarProps {
  projectId: string;
  serviceId: string | null;
  onClose: () => void;
}

export function ServiceSidebar({
  projectId,
  serviceId,
  onClose,
}: ServiceSidebarProps) {
  const { data: service } = useService(serviceId || "");
  const [activeTab, setActiveTab] = useState<
    "overview" | "deployments" | "logs" | "settings"
  >("overview");

  const isOpen = !!serviceId;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 top-[120px] z-30 w-[60vw] rounded-tl-xl border-l border-t border-neutral-800 bg-neutral-900 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      {service && (
        <>
          <div className="flex flex-row items-center justify-between border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
                <img
                  src={getServiceIcon(service) ?? FALLBACK_ICON}
                  alt=""
                  className="h-4 w-4 object-contain"
                />
              </div>
              <h2 className="text-lg font-semibold text-neutral-200">
                {service.name}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex h-[calc(100%-57px)] flex-col">
            <StateTabs
              tabs={[
                { id: "overview", label: "Overview" },
                { id: "deployments", label: "Deployments" },
                { id: "logs", label: "Logs" },
                { id: "settings", label: "Settings" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
              layoutId="sidebar-tabs"
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
              {activeTab === "overview" && (
                <SidebarOverview service={service} />
              )}
              {activeTab === "deployments" && (
                <SidebarDeployments service={service} />
              )}
              {activeTab === "logs" && <SidebarLogs service={service} />}
              {activeTab === "settings" && (
                <SidebarSettings service={service} projectId={projectId} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
