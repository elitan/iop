"use client";

import { motion } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnvVarEditor } from "@/components/env-var-editor";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateServiceDatabaseBinding,
  useDatabases,
  useDeleteServiceDatabaseBinding,
  useServiceDatabaseBindings,
} from "@/hooks/use-databases";
import { useProject } from "@/hooks/use-projects";
import { useDeployService, useUpdateService } from "@/hooks/use-services";
import type { EnvVar, Service } from "@/lib/api";
import { api } from "@/lib/api";
import { DomainsSection } from "../services/[serviceId]/_components/domains-section";
import { BuildConfigCard } from "../services/[serviceId]/settings/_components/build-config-card";
import { ContainerPortCard } from "../services/[serviceId]/settings/_components/container-port-card";
import { CpuLimitCard } from "../services/[serviceId]/settings/_components/cpu-limit-card";
import { DangerZoneCard } from "../services/[serviceId]/settings/_components/danger-zone-card";
import { DrainTimeoutCard } from "../services/[serviceId]/settings/_components/drain-timeout-card";
import { HealthCheckCard } from "../services/[serviceId]/settings/_components/health-check-card";
import { HostnameCard } from "../services/[serviceId]/settings/_components/hostname-card";
import { ImageConfigCard } from "../services/[serviceId]/settings/_components/image-config-card";
import { MemoryLimitCard } from "../services/[serviceId]/settings/_components/memory-limit-card";
import { ReplicaCountCard } from "../services/[serviceId]/settings/_components/replica-count-card";
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

function DatabaseBindingsCard({
  service,
  projectId,
}: {
  service: Service;
  projectId: string;
}) {
  const { data: databases = [] } = useDatabases(projectId);
  const { data: bindings = [] } = useServiceDatabaseBindings(service.id);
  const createBindingMutation = useCreateServiceDatabaseBinding(service.id);
  const deleteBindingMutation = useDeleteServiceDatabaseBinding(service.id);

  const [envVarKey, setEnvVarKey] = useState("");
  const [databaseId, setDatabaseId] = useState("");

  async function handleCreateBinding() {
    const key = envVarKey.trim().toUpperCase();
    if (!key || !databaseId) return;

    try {
      await createBindingMutation.mutateAsync({
        databaseId,
        envVarKey: key,
      });
      setEnvVarKey("");
      setDatabaseId("");
      toast.success("Database binding saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save binding";
      toast.error(message);
    }
  }

  async function handleDeleteBinding(bindingId: string) {
    try {
      await deleteBindingMutation.mutateAsync({ bindingId });
      toast.success("Database binding removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove binding";
      toast.error(message);
    }
  }

  function handleCreateBindingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCreateBinding();
  }

  return (
    <SettingCard
      title="Database bindings"
      description="Map env var keys to project databases. Frost resolves the current environment target URL at deploy time."
    >
      <div className="space-y-3">
        <form
          onSubmit={handleCreateBindingSubmit}
          className="flex flex-col gap-2 md:flex-row"
        >
          <Input
            value={envVarKey}
            onChange={(event) => setEnvVarKey(event.target.value)}
            placeholder="DATABASE_URL"
            className="border-neutral-700 bg-neutral-800 text-neutral-100 md:w-48"
          />
          <Select value={databaseId} onValueChange={setDatabaseId}>
            <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100 md:w-56">
              <SelectValue placeholder="Select database" />
            </SelectTrigger>
            <SelectContent className="border-neutral-700 bg-neutral-800">
              {databases.map((database) => (
                <SelectItem
                  key={database.id}
                  value={database.id}
                  className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                >
                  {database.name} ({database.engine})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={
              !envVarKey.trim() ||
              !databaseId ||
              createBindingMutation.isPending
            }
          >
            Save binding
          </Button>
        </form>

        {bindings.length === 0 ? (
          <p className="text-sm text-neutral-500">No bindings configured.</p>
        ) : (
          <div className="space-y-2">
            {bindings.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
              >
                <div className="text-sm text-neutral-200">
                  <span className="font-mono">{binding.envVarKey}</span> {"->"}{" "}
                  {binding.databaseName} ({binding.databaseEngine})
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteBinding(binding.id)}
                  disabled={deleteBindingMutation.isPending}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingCard>
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
        onSubmit={handleSave}
        footerRight={
          <Button
            size="sm"
            type="submit"
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

      <DatabaseBindingsCard service={service} projectId={projectId} />

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

export function SidebarSettings({ service, projectId }: SidebarSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

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
            runtimeSettingsUrl={`/projects/${projectId}/environments/${service.environmentId}/services/${service.id}/settings/runtime`}
          />
        )}

        {activeTab === "domains" && <DomainsTab service={service} />}

        {activeTab === "volumes" && <VolumesCard serviceId={service.id} />}

        {activeTab === "runtime" && (
          <>
            <ContainerPortCard serviceId={service.id} />
            <ReplicaCountCard serviceId={service.id} />
            <HealthCheckCard serviceId={service.id} />
            <RequestTimeoutCard serviceId={service.id} />
            <DrainTimeoutCard serviceId={service.id} />
            <ShutdownTimeoutCard serviceId={service.id} />
            <MemoryLimitCard serviceId={service.id} />
            <CpuLimitCard serviceId={service.id} />
          </>
        )}
      </div>
    </div>
  );
}
