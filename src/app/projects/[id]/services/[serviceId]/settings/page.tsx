"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDeleteService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";

export default function ServiceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deleteMutation = useDeleteService(projectId);

  const [editingHealth, setEditingHealth] = useState(false);
  const [healthType, setHealthType] = useState<"tcp" | "http">("tcp");
  const [healthPath, setHealthPath] = useState("");
  const [healthTimeout, setHealthTimeout] = useState(60);

  function handleEditHealth() {
    if (service) {
      const hasPath = !!service.healthCheckPath;
      setHealthType(hasPath ? "http" : "tcp");
      setHealthPath(service.healthCheckPath ?? "");
      setHealthTimeout(service.healthCheckTimeout ?? 60);
      setEditingHealth(true);
    }
  }

  async function handleSaveHealth() {
    try {
      await updateMutation.mutateAsync({
        healthCheckPath: healthType === "http" ? healthPath || "/health" : null,
        healthCheckTimeout: healthTimeout,
      });
      toast.success("Health check settings saved");
      setEditingHealth(false);
    } catch {
      toast.error("Failed to save");
    }
  }

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
            Verify app is responding before marking deployment as successful.
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
                  Timeout (seconds)
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
            <div className="flex items-center gap-3 text-sm">
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                {service.healthCheckPath
                  ? `HTTP ${service.healthCheckPath}`
                  : "TCP"}
              </span>
              <span className="text-neutral-400">
                {service.healthCheckTimeout ?? 60}s timeout
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
