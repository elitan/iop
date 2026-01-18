"use client";

import { motion } from "framer-motion";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnvVarEditor } from "@/components/env-var-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeployService, useUpdateService } from "@/hooks/use-services";
import type { EnvVar, Service } from "@/lib/api";
import { api } from "@/lib/api";
import { DomainsSection } from "../services/[serviceId]/_components/domains-section";
import { BuildConfigCard } from "../services/[serviceId]/settings/_components/build-config-card";
import { CpuLimitCard } from "../services/[serviceId]/settings/_components/cpu-limit-card";
import { DangerZoneCard } from "../services/[serviceId]/settings/_components/danger-zone-card";
import { HealthCheckCard } from "../services/[serviceId]/settings/_components/health-check-card";
import { ImageConfigCard } from "../services/[serviceId]/settings/_components/image-config-card";
import { MemoryLimitCard } from "../services/[serviceId]/settings/_components/memory-limit-card";
import { RequestTimeoutCard } from "../services/[serviceId]/settings/_components/request-timeout-card";
import { ServiceNameCard } from "../services/[serviceId]/settings/_components/service-name-card";
import { ShutdownTimeoutCard } from "../services/[serviceId]/settings/_components/shutdown-timeout-card";
import { VolumesCard } from "../services/[serviceId]/settings/_components/volumes-card";

interface SidebarSettingsProps {
  service: Service;
  projectId: string;
}

type SettingsTab = "general" | "variables" | "domains" | "runtime" | "danger";

function VariablesTab({
  service,
  projectId,
}: {
  service: Service;
  projectId: string;
}) {
  const updateMutation = useUpdateService(service.id, projectId);
  const deployMutation = useDeployService(service.id, projectId);

  const [editing, setEditing] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const initialEnvVars = useRef<EnvVar[]>([]);

  function handleEdit() {
    const vars = service.envVars ? JSON.parse(service.envVars) : [];
    setEnvVars(vars);
    initialEnvVars.current = vars;
    setEditing(true);
  }

  const hasChanges =
    JSON.stringify(envVars) !== JSON.stringify(initialEnvVars.current);

  async function handleSave() {
    const validEnvVars = envVars.filter((v) => v.key.trim() !== "");
    try {
      await updateMutation.mutateAsync({ envVars: validEnvVars });
      initialEnvVars.current = validEnvVars;
      toast.success("Environment variables saved", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  const vars: EnvVar[] = service.envVars ? JSON.parse(service.envVars) : [];

  return (
    <Card className="bg-neutral-800 border-neutral-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
          <span>Service Environment Variables</span>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-neutral-500">
          These are specific to this service (in addition to project-level
          vars).
        </p>
        {editing ? (
          <div className="space-y-4">
            <EnvVarEditor value={envVars} onChange={setEnvVars} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending || !hasChanges}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {vars.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No service-specific environment variables
              </p>
            ) : (
              vars.map((v) => (
                <div key={v.key} className="flex gap-2 font-mono text-sm">
                  <span className="text-neutral-300">{v.key}</span>
                  <span className="text-neutral-600">=</span>
                  <span className="text-neutral-500">••••••••</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DomainsTab({ service }: { service: Service }) {
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [wildcardConfigured, setWildcardConfigured] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
    fetch("/api/settings/wildcard")
      .then((res) => res.json())
      .then((data) => setWildcardConfigured(data.configured))
      .catch(() => {});
  }, []);

  return (
    <DomainsSection
      serviceId={service.id}
      hasRunningDeployment={!!service.currentDeploymentId}
      serverIp={serverIp}
      wildcardConfigured={wildcardConfigured}
    />
  );
}

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "variables", label: "Variables" },
  { id: "domains", label: "Domains" },
  { id: "runtime", label: "Runtime" },
  { id: "danger", label: "Danger" },
];

export function SidebarSettings({ service, projectId }: SidebarSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="flex gap-6">
      <nav className="w-32 shrink-0 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className="relative block w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
          >
            {activeTab === item.id && (
              <motion.div
                layoutId="sidebar-settings-indicator"
                className="absolute inset-0 rounded-md bg-neutral-800/80"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span
              className={`relative z-10 ${
                activeTab === item.id
                  ? "text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex-1 space-y-4">
        {activeTab === "general" && (
          <>
            <ServiceNameCard serviceId={service.id} projectId={projectId} />
            <BuildConfigCard serviceId={service.id} projectId={projectId} />
            <ImageConfigCard serviceId={service.id} projectId={projectId} />
          </>
        )}

        {activeTab === "variables" && (
          <VariablesTab service={service} projectId={projectId} />
        )}

        {activeTab === "domains" && <DomainsTab service={service} />}

        {activeTab === "runtime" && (
          <>
            <HealthCheckCard serviceId={service.id} projectId={projectId} />
            <RequestTimeoutCard serviceId={service.id} projectId={projectId} />
            <ShutdownTimeoutCard serviceId={service.id} projectId={projectId} />
            <MemoryLimitCard serviceId={service.id} projectId={projectId} />
            <CpuLimitCard serviceId={service.id} projectId={projectId} />
            {service.serviceType !== "database" && (
              <VolumesCard serviceId={service.id} projectId={projectId} />
            )}
          </>
        )}

        {activeTab === "danger" && (
          <DangerZoneCard serviceId={service.id} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
