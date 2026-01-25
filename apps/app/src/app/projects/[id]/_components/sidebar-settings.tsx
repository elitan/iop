"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnvVarEditor } from "@/components/env-var-editor";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-projects";
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

function parseEnvVars(json: string | null): EnvVar[] {
  return json ? JSON.parse(json) : [];
}

function getServiceEnvVars(service: Service): EnvVar[] {
  return parseEnvVars(service.envVars).filter((v) => v.key !== "PORT");
}

interface ReadOnlyVarProps {
  name: string;
  value: string;
}

function buildFrostVars(
  service: Service,
  projectName: string,
  projectId: string,
): ReadOnlyVarProps[] {
  const vars: ReadOnlyVarProps[] = [
    { name: "FROST", value: "1" },
    { name: "FROST_SERVICE_NAME", value: service.name },
    { name: "FROST_SERVICE_ID", value: service.id },
    { name: "FROST_PROJECT_NAME", value: projectName },
    { name: "FROST_PROJECT_ID", value: projectId },
    { name: "FROST_DEPLOYMENT_ID", value: "(set at runtime)" },
    {
      name: "FROST_INTERNAL_HOSTNAME",
      value: service.hostname ?? service.name,
    },
  ];

  if (service.deployType === "repo") {
    vars.push(
      { name: "FROST_GIT_COMMIT_SHA", value: "(set at runtime)" },
      { name: "FROST_GIT_BRANCH", value: service.branch ?? "main" },
    );
  }

  vars.push({ name: "PORT", value: String(service.containerPort ?? 8080) });
  return vars;
}

interface VariablesTabProps {
  service: Service;
  projectId: string;
  runtimeSettingsUrl: string;
}

function ReadOnlyVar({ name, value }: ReadOnlyVarProps) {
  return (
    <div className="flex gap-2 font-mono text-sm">
      <span className="text-neutral-400">{name}</span>
      <span className="text-neutral-600">=</span>
      <span className="text-neutral-500">{value}</span>
    </div>
  );
}

function VariablesTab({
  service,
  projectId,
  runtimeSettingsUrl,
}: VariablesTabProps) {
  const updateMutation = useUpdateService(service.id, service.environmentId);
  const deployMutation = useDeployService(service.id, service.environmentId);
  const { data: project } = useProject(projectId);

  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);
  const initialEnvVars = useRef<EnvVar[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      const vars = getServiceEnvVars(service);
      setEnvVars(vars);
      initialEnvVars.current = vars;
      initialized.current = true;
    }
  }, [service]);

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
    } catch {
      toast.error("Failed to save");
    }
  }

  const projectVars = parseEnvVars(project?.envVars ?? null);

  const frostVars = buildFrostVars(service, project?.name ?? "", projectId);

  return (
    <div className="space-y-4">
      <SettingCard
        title="Service Environment Variables"
        description="These are specific to this service (in addition to project-level vars). The PORT variable is managed by the Container Port setting in Runtime."
        footerRight={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={
              updateMutation.isPending || !hasChanges || hasValidationErrors
            }
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        }
      >
        <EnvVarEditor
          value={envVars}
          onChange={setEnvVars}
          onValidationChange={setHasValidationErrors}
          managedKeySettingsUrl={runtimeSettingsUrl}
        />
      </SettingCard>

      <SettingCard
        title="Project Environment Variables"
        description={
          <>
            Inherited from project settings.{" "}
            <a
              href={`/projects/${projectId}/settings/variables`}
              className="text-blue-400 hover:underline"
            >
              Edit in project settings
            </a>
          </>
        }
      >
        {projectVars.length > 0 ? (
          <div className="space-y-1">
            {projectVars.map((v) => (
              <ReadOnlyVar key={v.key} name={v.key} value="••••••••" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            No project environment variables configured
          </p>
        )}
      </SettingCard>

      <SettingCard
        title="Frost Environment Variables"
        description="Automatically injected by Frost at runtime."
      >
        <div className="space-y-1">
          {frostVars.map((v) => (
            <ReadOnlyVar key={v.name} name={v.name} value={v.value} />
          ))}
        </div>
      </SettingCard>
    </div>
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
  { id: "variables", label: "Env vars" },
  { id: "domains", label: "Domains" },
  { id: "volumes", label: "Volumes" },
  { id: "runtime", label: "Runtime" },
];

const VALID_TABS = new Set<string>(NAV_ITEMS.map((item) => item.id));

function isValidTab(tab: string | null): tab is SettingsTab {
  return tab !== null && VALID_TABS.has(tab);
}

export function SidebarSettings({ service, projectId }: SidebarSettingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = isValidTab(tabParam) ? tabParam : "general";

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
            projectId={projectId}
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
