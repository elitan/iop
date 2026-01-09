"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Rocket,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { EmptyState } from "@/components/empty-state";
import { EnvVarEditor } from "@/components/env-var-editor";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useProject } from "@/hooks/use-projects";
import {
  useDeleteService,
  useDeployService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";
import type { Deployment, Domain, EnvVar } from "@/lib/api";
import { api } from "@/lib/api";
import { buildConnectionString } from "@/lib/db-templates";
import { buildSslipDomain } from "@/lib/sslip";
import { cn } from "@/lib/utils";
import { DeploymentRow } from "./_components/deployment-row";
import { DomainsSection } from "./_components/domains-section";
import { RuntimeLogs } from "./_components/runtime-logs";
import { ServiceMetricsCard } from "./_components/service-metrics-card";

export default function ServicePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: project } = useProject(projectId);
  const { data: service, isLoading } = useService(serviceId);
  const deployMutation = useDeployService(serviceId, projectId);
  const deleteMutation = useDeleteService(projectId);
  const updateMutation = useUpdateService(serviceId, projectId);

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDeployment, setSelectedDeployment] =
    useState<Deployment | null>(null);
  const selectedDeploymentRef = useRef<string | null>(null);
  const [editingEnv, setEditingEnv] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [systemDomain, setSystemDomain] = useState<Domain | null>(null);
  const [editingHealth, setEditingHealth] = useState(false);
  const [healthPath, setHealthPath] = useState<string>("");
  const [healthTimeout, setHealthTimeout] = useState<number>(60);
  const [activeLogTab, setActiveLogTab] = useState<"build" | "runtime">(
    "build",
  );
  const queryClient = useQueryClient();

  const { data: tcpProxy } = useQuery({
    queryKey: ["tcp-proxy", serviceId],
    queryFn: () => api.tcpProxy.get(serviceId),
    enabled: service?.serviceType === "database",
  });

  const enableTcpProxyMutation = useMutation({
    mutationFn: () => api.tcpProxy.enable(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", serviceId] });
      toast.success("TCP proxy enabled");
    },
    onError: () => toast.error("Failed to enable TCP proxy"),
  });

  const disableTcpProxyMutation = useMutation({
    mutationFn: () => api.tcpProxy.disable(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tcp-proxy", serviceId] });
      toast.success("TCP proxy disabled");
    },
    onError: () => toast.error("Failed to disable TCP proxy"),
  });

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      api.deployments.rollback(deploymentId),
    onSuccess: () => {
      toast.success("Rollback started");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    },
  });

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    api.domains.list(serviceId).then((domains) => {
      const sys = domains.find((d) => d.isSystem === 1);
      setSystemDomain(sys ?? null);
    });
  }, [serviceId]);

  useEffect(() => {
    if (!service) return;
    async function fetchDeployments() {
      const deps = await api.deployments.listByService(serviceId);
      setDeployments(deps);
    }
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 2000);
    return () => clearInterval(interval);
  }, [service, serviceId]);

  useEffect(() => {
    if (deployments.length === 0) {
      setSelectedDeployment(null);
      return;
    }
    if (!selectedDeploymentRef.current) {
      setSelectedDeployment(deployments[0]);
      selectedDeploymentRef.current = deployments[0].id;
    } else {
      const updated = deployments.find(
        (d) => d.id === selectedDeploymentRef.current,
      );
      if (updated) setSelectedDeployment(updated);
    }
  }, [deployments]);

  function handleSelectDeployment(d: Deployment) {
    setSelectedDeployment(d);
    selectedDeploymentRef.current = d.id;
  }

  async function handleDeploy() {
    try {
      await deployMutation.mutateAsync();
      toast.success("Deployment started");
    } catch {
      toast.error("Failed to start deployment");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this service?")) return;
    try {
      await deleteMutation.mutateAsync(serviceId);
      toast.success("Service deleted");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Failed to delete service");
    }
  }

  function handleEditEnv() {
    if (service) {
      setEnvVars(service.envVars ? JSON.parse(service.envVars) : []);
      setEditingEnv(true);
    }
  }

  function handleEditHealth() {
    if (service) {
      setHealthPath(service.healthCheckPath ?? "");
      setHealthTimeout(service.healthCheckTimeout ?? 60);
      setEditingHealth(true);
    }
  }

  async function handleSaveHealth() {
    try {
      await updateMutation.mutateAsync({
        health_check_path: healthPath || null,
        health_check_timeout: healthTimeout,
      });
      toast.success("Health check settings saved");
      setEditingHealth(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleSaveEnv() {
    const validEnvVars = envVars.filter((v) => v.key.trim() !== "");
    try {
      await updateMutation.mutateAsync({ env_vars: validEnvVars });
      toast.success("Environment variables saved");
      setEditingEnv(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  if (isLoading) {
    return (
      <>
        <BreadcrumbHeader
          items={[
            { label: project?.name ?? "...", href: `/projects/${projectId}` },
            { label: "..." },
          ]}
        />
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="mt-2 h-4 w-64" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-3 gap-6">
              <Skeleton className="h-64" />
              <Skeleton className="col-span-2 h-64" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!service)
    return (
      <>
        <BreadcrumbHeader
          items={[
            { label: project?.name ?? "...", href: `/projects/${projectId}` },
          ]}
        />
        <main className="container mx-auto px-4 py-8">
          <div className="text-neutral-400">Service not found</div>
        </main>
      </>
    );

  const runningDeployment = deployments.find((d) => d.status === "running");

  return (
    <>
      <BreadcrumbHeader
        items={[
          { label: project?.name ?? "...", href: `/projects/${projectId}` },
          { label: service.name },
        ]}
      />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-medium text-neutral-100">
                {service.name}
              </h1>
              <p className="mt-1 font-mono text-sm text-neutral-500">
                {service.deployType === "image"
                  ? service.imageUrl
                  : service.repoUrl}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDeploy}
                disabled={deployMutation.isPending}
                size="sm"
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
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 text-neutral-500" />
              </Button>
            </div>
          </div>

          {runningDeployment && (
            <Card className="border-l-2 border-l-green-500 bg-neutral-900 border-neutral-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusDot status="running" />
                    {systemDomain ? (
                      <a
                        href={`https://${systemDomain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-blue-400 hover:text-blue-300"
                      >
                        {systemDomain.domain}
                      </a>
                    ) : (
                      <span className="text-sm text-neutral-300">
                        Running on port {runningDeployment.hostPort}
                      </span>
                    )}
                  </div>
                  <a
                    href={
                      systemDomain
                        ? `https://${systemDomain.domain}`
                        : `http://${serverIp || "localhost"}:${runningDeployment.hostPort}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <p className="mt-1 font-mono text-xs text-neutral-500">
                  {runningDeployment.commitSha}
                </p>
              </CardContent>
            </Card>
          )}

          {runningDeployment && <ServiceMetricsCard serviceId={serviceId} />}

          {service.serviceType === "database" && (
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                  <Database className="h-4 w-4" />
                  Database Connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {runningDeployment ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs text-neutral-500">
                        Internal Connection (within project)
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-300">
                          {buildConnectionString(
                            service.imageUrl?.split(":")[0] ?? "",
                            service.name,
                            service.containerPort ?? 5432,
                            JSON.parse(service.envVars).reduce(
                              (acc: Record<string, string>, v: EnvVar) => {
                                acc[v.key] = v.value;
                                return acc;
                              },
                              {},
                            ),
                          )}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              buildConnectionString(
                                service.imageUrl?.split(":")[0] ?? "",
                                service.name,
                                service.containerPort ?? 5432,
                                JSON.parse(service.envVars).reduce(
                                  (acc: Record<string, string>, v: EnvVar) => {
                                    acc[v.key] = v.value;
                                    return acc;
                                  },
                                  {},
                                ),
                              ),
                            );
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-neutral-800 pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="flex items-center gap-2 text-sm text-neutral-300">
                            <Globe className="h-4 w-4" />
                            Public Access (TCP Proxy)
                          </span>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            Expose database to external connections
                          </p>
                        </div>
                        <Switch
                          checked={tcpProxy?.enabled ?? false}
                          disabled={
                            enableTcpProxyMutation.isPending ||
                            disableTcpProxyMutation.isPending
                          }
                          onCheckedChange={(checked: boolean) => {
                            if (checked) {
                              enableTcpProxyMutation.mutate();
                            } else {
                              disableTcpProxyMutation.mutate();
                            }
                          }}
                        />
                      </div>

                      {tcpProxy?.enabled && tcpProxy.port && serverIp && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs text-neutral-500">
                            External Connection
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 rounded bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-300">
                              {buildConnectionString(
                                service.imageUrl?.split(":")[0] ?? "",
                                buildSslipDomain(
                                  service.name,
                                  project?.name ?? "",
                                  serverIp,
                                ),
                                tcpProxy.port,
                                JSON.parse(service.envVars).reduce(
                                  (acc: Record<string, string>, v: EnvVar) => {
                                    acc[v.key] = v.value;
                                    return acc;
                                  },
                                  {},
                                ),
                              )}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  buildConnectionString(
                                    service.imageUrl?.split(":")[0] ?? "",
                                    buildSslipDomain(
                                      service.name,
                                      project?.name ?? "",
                                      serverIp,
                                    ),
                                    tcpProxy.port!,
                                    JSON.parse(service.envVars).reduce(
                                      (
                                        acc: Record<string, string>,
                                        v: EnvVar,
                                      ) => {
                                        acc[v.key] = v.value;
                                        return acc;
                                      },
                                      {},
                                    ),
                                  ),
                                );
                                toast.success("Copied to clipboard");
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Deploy the database to view connection details.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-1">
              <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-neutral-300">
                    Deployments
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {deployments.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        title="No deployments"
                        description="Click Deploy to create one"
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-800">
                      {deployments.map((d) => {
                        const hasVolumes =
                          service?.volumes && service.volumes !== "[]";
                        const canRollback =
                          !hasVolumes &&
                          !!d.imageName &&
                          d.rollbackEligible === 1;
                        const runningDeployment = deployments.find(
                          (dep) => dep.status === "running",
                        );
                        return (
                          <DeploymentRow
                            key={d.id}
                            id={d.id}
                            commitSha={d.commitSha}
                            status={d.status}
                            createdAt={d.createdAt}
                            selected={selectedDeployment?.id === d.id}
                            onClick={() => handleSelectDeployment(d)}
                            canRollback={canRollback}
                            isRunning={runningDeployment?.id === d.id}
                            onRollback={() => rollbackMutation.mutate(d.id)}
                            isRollingBack={
                              rollbackMutation.isPending &&
                              rollbackMutation.variables === d.id
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-2">
              {selectedDeployment && (
                <Card className="bg-neutral-900 border-neutral-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveLogTab("build")}
                          className={cn(
                            "border-b-2 pb-1 transition-colors",
                            activeLogTab === "build"
                              ? "border-white text-white"
                              : "border-transparent text-neutral-500 hover:text-neutral-300",
                          )}
                        >
                          Build
                        </button>
                        {selectedDeployment.status === "running" && (
                          <button
                            type="button"
                            onClick={() => setActiveLogTab("runtime")}
                            className={cn(
                              "border-b-2 pb-1 transition-colors",
                              activeLogTab === "runtime"
                                ? "border-white text-white"
                                : "border-transparent text-neutral-500 hover:text-neutral-300",
                            )}
                          >
                            Runtime
                          </button>
                        )}
                      </div>
                      <StatusDot status={selectedDeployment.status} showLabel />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activeLogTab === "build" ? (
                      <>
                        {selectedDeployment.errorMessage && (
                          <div className="mb-4 rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
                            {selectedDeployment.errorMessage}
                          </div>
                        )}
                        <pre className="max-h-96 overflow-auto rounded bg-neutral-950 p-4 font-mono text-xs text-neutral-400">
                          {selectedDeployment.buildLog || "No logs yet..."}
                        </pre>
                      </>
                    ) : (
                      <RuntimeLogs deploymentId={selectedDeployment.id} />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-300">
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                {service.deployType === "repo" ? (
                  <>
                    <div>
                      <dt className="text-neutral-500">Branch</dt>
                      <dd className="mt-1 font-mono text-neutral-300">
                        {service.branch}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Dockerfile</dt>
                      <dd className="mt-1 font-mono text-neutral-300">
                        {service.dockerfilePath}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt className="text-neutral-500">Image</dt>
                    <dd className="mt-1 font-mono text-neutral-300">
                      {service.imageUrl}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-neutral-500">Container Port</dt>
                  <dd className="mt-1 font-mono text-neutral-300">
                    {service.containerPort ?? 8080}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
                <span>Health Check</span>
                {!editingHealth && (
                  <Button variant="ghost" size="sm" onClick={handleEditHealth}>
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-xs text-neutral-500">
                Verify app is responding before marking deployment as
                successful.
              </p>
              {editingHealth ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">
                        Path (empty = TCP check)
                      </span>
                      <input
                        type="text"
                        value={healthPath}
                        onChange={(e) => setHealthPath(e.target.value)}
                        placeholder="/health"
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">
                        Timeout (seconds)
                      </span>
                      <input
                        type="number"
                        value={healthTimeout}
                        onChange={(e) =>
                          setHealthTimeout(Number(e.target.value))
                        }
                        min={1}
                        max={300}
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-neutral-600 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveHealth}
                      disabled={updateMutation.isPending}
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
                      onClick={() => setEditingHealth(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-neutral-500">Method</dt>
                    <dd className="mt-1 font-mono text-neutral-300">
                      {service.healthCheckPath
                        ? `HTTP GET ${service.healthCheckPath}`
                        : "TCP"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Timeout</dt>
                    <dd className="mt-1 font-mono text-neutral-300">
                      {service.healthCheckTimeout ?? 60}s
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          {service.serviceType !== "database" && (
            <DomainsSection
              serviceId={serviceId}
              hasRunningDeployment={!!runningDeployment}
              serverIp={serverIp}
            />
          )}

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
                <span>Service Environment Variables</span>
                {!editingEnv && (
                  <Button variant="ghost" size="sm" onClick={handleEditEnv}>
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
              {editingEnv ? (
                <div className="space-y-4">
                  <EnvVarEditor value={envVars} onChange={setEnvVars} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveEnv}
                      disabled={updateMutation.isPending}
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
                      onClick={() => setEditingEnv(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const vars: EnvVar[] = service.envVars
                      ? JSON.parse(service.envVars)
                      : [];
                    if (vars.length === 0) {
                      return (
                        <p className="text-sm text-neutral-500">
                          No service-specific environment variables
                        </p>
                      );
                    }
                    return vars.map((v) => (
                      <div key={v.key} className="flex gap-2 font-mono text-sm">
                        <span className="text-neutral-300">{v.key}</span>
                        <span className="text-neutral-600">=</span>
                        <span className="text-neutral-500">••••••••</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
