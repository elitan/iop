"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeployService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";

interface HealthCheckCardProps {
  serviceId: string;
  projectId: string;
}

export function HealthCheckCard({
  serviceId,
  projectId,
}: HealthCheckCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [healthType, setHealthType] = useState<"tcp" | "http">("tcp");
  const [healthPath, setHealthPath] = useState("");
  const [startupTimeout, setStartupTimeout] = useState(60);

  useEffect(() => {
    if (service) {
      const hasPath = !!service.healthCheckPath;
      setHealthType(hasPath ? "http" : "tcp");
      setHealthPath(service.healthCheckPath ?? "");
      setStartupTimeout(service.healthCheckTimeout ?? 60);
    }
  }, [service]);

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        healthCheckPath: healthType === "http" ? healthPath || "/health" : null,
        healthCheckTimeout: startupTimeout,
      });
      toast.success("Health check settings saved", {
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

  if (!service) return null;

  return (
    <SettingCard
      title="Health Check"
      description="Frost uses health checks to determine when your container is ready to receive traffic. TCP checks port connectivity, HTTP sends a GET request to the specified path."
      learnMoreUrl="https://docs.docker.com/reference/dockerfile/#healthcheck"
      learnMoreText="Learn more about Health Checks"
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-sm text-neutral-400">Type</span>
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
        </div>

        {healthType === "http" && (
          <div>
            <span className="mb-2 block text-sm text-neutral-400">Path</span>
            <Input
              type="text"
              value={healthPath}
              onChange={(e) => setHealthPath(e.target.value)}
              placeholder="/health"
              className="max-w-sm font-mono"
            />
          </div>
        )}

        <div>
          <span className="mb-2 block text-sm text-neutral-400">
            Startup Timeout
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={startupTimeout}
              onChange={(e) => setStartupTimeout(Number(e.target.value))}
              min={1}
              max={300}
              className="w-24"
            />
            <span className="text-sm text-neutral-500">seconds</span>
          </div>
        </div>
      </div>
    </SettingCard>
  );
}
