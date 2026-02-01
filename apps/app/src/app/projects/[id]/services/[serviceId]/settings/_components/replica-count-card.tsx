"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const REPLICA_OPTIONS = [
  { value: "1", label: "1 (default)" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "5", label: "5" },
  { value: "10", label: "10" },
];

interface ReplicaCountCardProps {
  serviceId: string;
}

export function ReplicaCountCard({ serviceId }: ReplicaCountCardProps) {
  const { data: service } = useService(serviceId);
  const envId = service?.environmentId ?? "";
  const updateMutation = useUpdateService(serviceId, envId);
  const deployMutation = useDeployService(serviceId, envId);

  const [replicaCount, setReplicaCount] = useState("1");
  const initialValue = useRef("1");

  const hasVolumes =
    service?.volumes !== undefined &&
    service.volumes !== null &&
    service.volumes !== "[]";

  useEffect(() => {
    if (service) {
      const value = (service.replicaCount ?? 1).toString();
      setReplicaCount(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = replicaCount !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        replicaCount: Number(replicaCount),
      });
      initialValue.current = replicaCount;
      toast.success("Replica count saved", {
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

  const selectElement = (
    <Select
      value={replicaCount}
      onValueChange={setReplicaCount}
      disabled={hasVolumes}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REPLICA_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <SettingCard
      title="Replicas"
      description="Number of container instances to run. Traffic is load-balanced across replicas using round-robin. All replicas must pass health checks."
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending || !hasChanges || hasVolumes}
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <div
        title={
          hasVolumes
            ? "Replicas not available for services with volumes"
            : undefined
        }
      >
        {selectElement}
      </div>
    </SettingCard>
  );
}
