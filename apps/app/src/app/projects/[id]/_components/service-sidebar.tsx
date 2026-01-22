"use client";

import { Loader2, Rocket, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StateTabs } from "@/components/state-tabs";
import { Button } from "@/components/ui/button";
import { useDeployService, useService } from "@/hooks/use-services";
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
  const deployMutation = useDeployService(
    serviceId || "",
    service?.environmentId ?? "",
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "deployments" | "logs" | "settings"
  >("overview");

  async function handleDeploy() {
    if (!serviceId) return;
    try {
      await deployMutation.mutateAsync();
      toast.success("Deployment started");
    } catch {
      toast.error("Failed to start deployment");
    }
  }

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
            <h2 className="text-lg font-semibold text-neutral-200">
              {service.name}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleDeploy}
                disabled={deployMutation.isPending}
              >
                {deployMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Deploying
                  </>
                ) : (
                  <>
                    <Rocket className="mr-1.5 h-4 w-4" />
                    Deploy
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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

            <div className="flex-1 overflow-auto p-4">
              {activeTab === "overview" && (
                <SidebarOverview service={service} onDeploy={handleDeploy} />
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
