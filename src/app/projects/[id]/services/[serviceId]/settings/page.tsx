"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeleteService,
  useDeployService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";
import { api } from "@/lib/api";

const MEMORY_OPTIONS = [
  { value: "", label: "No limit" },
  { value: "256m", label: "256 MB", minGB: 1 },
  { value: "512m", label: "512 MB", minGB: 1 },
  { value: "1g", label: "1 GB", minGB: 2 },
  { value: "2g", label: "2 GB", minGB: 3 },
  { value: "4g", label: "4 GB", minGB: 5 },
  { value: "8g", label: "8 GB", minGB: 9 },
  { value: "16g", label: "16 GB", minGB: 17 },
  { value: "32g", label: "32 GB", minGB: 33 },
  { value: "64g", label: "64 GB", minGB: 65 },
];

const CPU_OPTIONS = [
  { value: "", label: "No limit" },
  { value: "0.25", label: "0.25 vCPU", minCpus: 1 },
  { value: "0.5", label: "0.5 vCPU", minCpus: 1 },
  { value: "1", label: "1 vCPU", minCpus: 1 },
  { value: "2", label: "2 vCPU", minCpus: 2 },
  { value: "4", label: "4 vCPU", minCpus: 4 },
  { value: "8", label: "8 vCPU", minCpus: 8 },
  { value: "16", label: "16 vCPU", minCpus: 16 },
  { value: "32", label: "32 vCPU", minCpus: 32 },
];

const SHUTDOWN_OPTIONS = [
  { value: "", label: "Default (10s)" },
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "120", label: "120 seconds" },
];

export default function ServiceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deleteMutation = useDeleteService(projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [editingHealth, setEditingHealth] = useState(false);
  const [healthType, setHealthType] = useState<"tcp" | "http">("tcp");
  const [healthPath, setHealthPath] = useState("");
  const [healthTimeout, setHealthTimeout] = useState(60);

  const [shutdownTimeout, setShutdownTimeout] = useState("");

  const [editingLimits, setEditingLimits] = useState(false);
  const [memoryLimit, setMemoryLimit] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");

  const { data: hostResources } = useQuery({
    queryKey: ["hostResources"],
    queryFn: () => api.health.hostResources(),
  });

  function handleEditHealth() {
    if (service) {
      const hasPath = !!service.healthCheckPath;
      setHealthType(hasPath ? "http" : "tcp");
      setHealthPath(service.healthCheckPath ?? "");
      setHealthTimeout(service.healthCheckTimeout ?? 60);
      setShutdownTimeout(service.shutdownTimeout?.toString() ?? "");
      setEditingHealth(true);
    }
  }

  async function handleSaveHealth() {
    try {
      await updateMutation.mutateAsync({
        healthCheckPath: healthType === "http" ? healthPath || "/health" : null,
        healthCheckTimeout: healthTimeout,
        shutdownTimeout: shutdownTimeout ? Number(shutdownTimeout) : null,
      });
      toast.success("Health & lifecycle settings saved", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
      setEditingHealth(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  function handleEditLimits() {
    if (service) {
      setMemoryLimit(service.memoryLimit ?? "");
      setCpuLimit(service.cpuLimit?.toString() ?? "");
      setEditingLimits(true);
    }
  }

  async function handleSaveLimits() {
    try {
      await updateMutation.mutateAsync({
        memoryLimit: memoryLimit || null,
        cpuLimit: cpuLimit ? Number(cpuLimit) : null,
      });
      toast.success("Resource limits saved", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
      setEditingLimits(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  const filteredMemoryOptions = MEMORY_OPTIONS.filter(
    (opt) => !opt.minGB || (hostResources?.totalMemoryGB ?? 0) >= opt.minGB,
  );
  const filteredCpuOptions = CPU_OPTIONS.filter(
    (opt) => !opt.minCpus || (hostResources?.cpus ?? 0) >= opt.minCpus,
  );

  async function handleDelete() {
    if (!confirm("Delete this service? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync(serviceId);
      toast.success("Service deleted");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Failed to delete service");
    }
  }

  if (!service) return null;

  return (
    <div className="space-y-6">
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            Configuration
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
            <span>Health & Lifecycle</span>
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
            Health checks and container lifecycle settings.
          </p>
          {editingHealth ? (
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-xs text-neutral-500">
                  Type
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHealthType("tcp")}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      healthType === "tcp"
                        ? "border-neutral-600 bg-neutral-700 text-neutral-200"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    TCP
                  </button>
                  <button
                    type="button"
                    onClick={() => setHealthType("http")}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      healthType === "http"
                        ? "border-neutral-600 bg-neutral-700 text-neutral-200"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    HTTP
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">
                  {healthType === "tcp"
                    ? "Port connectivity check. Use for databases, Redis, etc."
                    : "GET request to endpoint. Use for web apps."}
                </p>
              </div>

              {healthType === "http" && (
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">
                    Path
                  </span>
                  <input
                    type="text"
                    value={healthPath}
                    onChange={(e) => setHealthPath(e.target.value)}
                    placeholder="/health"
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-neutral-600">
                    Common: /health, /healthz, /ready
                  </p>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Health Check Timeout (seconds)
                </span>
                <input
                  type="number"
                  value={healthTimeout}
                  onChange={(e) => setHealthTimeout(Number(e.target.value))}
                  min={1}
                  max={300}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-neutral-600 focus:outline-none"
                />
                <p className="mt-1 text-xs text-neutral-600">
                  Max wait for container to become healthy
                </p>
              </label>

              <div>
                <span className="mb-2 block text-xs text-neutral-500">
                  Shutdown Timeout
                </span>
                <Select
                  value={shutdownTimeout}
                  onValueChange={setShutdownTimeout}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Default (10s)" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHUTDOWN_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "none"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-neutral-600">
                  Time between SIGTERM and SIGKILL on stop
                </p>
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
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                {service.healthCheckPath
                  ? `HTTP ${service.healthCheckPath}`
                  : "TCP"}
              </span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                Health: {service.healthCheckTimeout ?? 60}s
              </span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                Shutdown: {service.shutdownTimeout ?? 10}s
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
            <span>Resource Limits</span>
            {!editingLimits && (
              <Button variant="ghost" size="sm" onClick={handleEditLimits}>
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-neutral-500">
            Limit container CPU and memory usage. Applies on next deployment.
          </p>
          {editingLimits ? (
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-xs text-neutral-500">
                  Memory Limit
                </span>
                <Select value={memoryLimit} onValueChange={setMemoryLimit}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No limit" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMemoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "none"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="mb-2 block text-xs text-neutral-500">
                  CPU Limit
                </span>
                <Select value={cpuLimit} onValueChange={setCpuLimit}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No limit" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCpuOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "none"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-neutral-600">
                  vCPU = logical CPU (includes hyperthreading)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveLimits}
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
                  onClick={() => setEditingLimits(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                Memory: {service.memoryLimit ?? "No limit"}
              </span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                CPU:{" "}
                {service.cpuLimit ? `${service.cpuLimit} vCPU` : "No limit"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-900/50 bg-neutral-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-red-400">
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-300">Delete Service</p>
              <p className="text-xs text-neutral-500">
                Permanently delete this service and all its deployments
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Delete Service
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
