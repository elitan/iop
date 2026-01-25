"use client";

import { motion } from "framer-motion";
import { Loader2, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { ContainerPortCard } from "../services/[serviceId]/settings/_components/container-port-card";
import { CpuLimitCard } from "../services/[serviceId]/settings/_components/cpu-limit-card";
import { DangerZoneCard } from "../services/[serviceId]/settings/_components/danger-zone-card";
import { HealthCheckCard } from "../services/[serviceId]/settings/_components/health-check-card";
import { HostnameCard } from "../services/[serviceId]/settings/_components/hostname-card";
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

type SettingsTab = "general" | "variables" | "domains" | "volumes" | "runtime";

function parseEnvVars(service: Service): EnvVar[] {
  const allVars: EnvVar[] = service.envVars ? JSON.parse(service.envVars) : [];
  return allVars.filter((v) => v.key !== "PORT");
}

interface VariablesTabProps {
  service: Service;
  runtimeSettingsUrl: string;
}

function VariablesTab({ service, runtimeSettingsUrl }: VariablesTabProps) {
  const updateMutation = useUpdateService(service.id, service.environmentId);
  const deployMutation = useDeployService(service.id, service.environmentId);

  const [editing, setEditing] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);
  const initialEnvVars = useRef<EnvVar[]>([]);

  function handleEdit() {
    const vars = parseEnvVars(service);
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

  const vars = parseEnvVars(service);

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
          vars). The <code className="text-neutral-400">PORT</code> variable is
          managed by the Container Port setting in Runtime.
        </p>
        {editing ? (
          <div className="space-y-4">
            <EnvVarEditor
              value={envVars}
              onChange={setEnvVars}
              onValidationChange={setHasValidationErrors}
              managedKeySettingsUrl={runtimeSettingsUrl}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={
                  updateMutation.isPending || !hasChanges || hasValidationErrors
                }
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
  { id: "volumes", label: "Volumes" },
  { id: "runtime", label: "Runtime" },
];

export function SidebarSettings({ service, projectId }: SidebarSettingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab =
    tabParam && NAV_ITEMS.some((item) => item.id === tabParam)
      ? (tabParam as SettingsTab)
      : "general";

  function buildTabUrl(tab: SettingsTab): string {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "general") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function setActiveTab(tab: SettingsTab) {
    router.push(buildTabUrl(tab), { scroll: false });
  }

  return (
    <div className="flex gap-6">
      <nav className="sticky top-0 self-start w-32 shrink-0 space-y-0.5">
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
              className={
                activeTab === item.id
                  ? "relative z-10 text-white"
                  : "relative z-10 text-neutral-400 hover:text-neutral-200"
              }
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex-1 space-y-4">
        {activeTab === "general" && (
          <>
            <ServiceNameCard serviceId={service.id} />
            <HostnameCard serviceId={service.id} />
            <BuildConfigCard serviceId={service.id} />
            <ImageConfigCard serviceId={service.id} />
            <DangerZoneCard
              serviceId={service.id}
              projectId={projectId}
              environmentId={service.environmentId}
            />
          </>
        )}

        {activeTab === "variables" && (
          <VariablesTab
            service={service}
            runtimeSettingsUrl={buildTabUrl("runtime")}
          />
        )}

        {activeTab === "domains" && <DomainsTab service={service} />}

        {activeTab === "volumes" && <VolumesCard serviceId={service.id} />}

        {activeTab === "runtime" && (
          <>
            <ContainerPortCard serviceId={service.id} />
            <HealthCheckCard serviceId={service.id} />
            <RequestTimeoutCard serviceId={service.id} />
            <ShutdownTimeoutCard serviceId={service.id} />
            <MemoryLimitCard serviceId={service.id} />
            <CpuLimitCard serviceId={service.id} />
          </>
        )}
      </div>
    </div>
  );
}
