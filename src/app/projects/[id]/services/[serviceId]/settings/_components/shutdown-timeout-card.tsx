"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeployService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";

const SHUTDOWN_OPTIONS = [
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "120", label: "120 seconds" },
];

interface ShutdownTimeoutCardProps {
  serviceId: string;
  projectId: string;
}

export function ShutdownTimeoutCard({
  serviceId,
  projectId,
}: ShutdownTimeoutCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [shutdownTimeout, setShutdownTimeout] = useState("10");

  useEffect(() => {
    if (service) {
      setShutdownTimeout(service.shutdownTimeout?.toString() ?? "10");
    }
  }, [service]);

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        shutdownTimeout: Number(shutdownTimeout),
      });
      toast.success("Shutdown timeout saved", {
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
      title="Shutdown Timeout"
      description="Time between sending SIGTERM and SIGKILL when stopping the container. Allows your application to gracefully shut down connections and save state."
      learnMoreUrl="https://docs.docker.com/reference/cli/docker/container/stop/"
      learnMoreText="Learn more about Shutdown Timeout"
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
      <Select value={shutdownTimeout} onValueChange={setShutdownTimeout}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SHUTDOWN_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingCard>
  );
}
