"use client";

import { Loader2, Rocket, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const deployMutation = useDeployService(serviceId || "", projectId);
  const [activeTab, setActiveTab] = useState("overview");

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

  return (
    <div
      className={cn(
        "absolute right-0 top-0 z-20 h-full w-[60vw] border-l border-neutral-800 bg-neutral-900 transition-transform duration-300 ease-in-out",
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

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex h-[calc(100%-57px)] flex-col"
          >
            <TabsList className="h-10 w-full justify-start rounded-none border-b border-neutral-800 bg-transparent px-4">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="deployments"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Deployments
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Logs
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="overview"
              className="mt-0 flex-1 overflow-auto p-4"
            >
              <SidebarOverview
                service={service}
                projectId={projectId}
                onDeploy={handleDeploy}
              />
            </TabsContent>

            <TabsContent
              value="deployments"
              className="mt-0 flex-1 overflow-auto p-4"
            >
              <SidebarDeployments service={service} projectId={projectId} />
            </TabsContent>

            <TabsContent value="logs" className="mt-0 flex-1 overflow-auto p-4">
              <SidebarLogs service={service} />
            </TabsContent>

            <TabsContent
              value="settings"
              className="mt-0 flex-1 overflow-auto p-4"
            >
              <SidebarSettings service={service} projectId={projectId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
