"use client";

import { useQuery } from "@tanstack/react-query";
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
import { api } from "@/lib/api";

const MEMORY_OPTIONS = [
  { value: "none", label: "No limit" },
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

interface MemoryLimitCardProps {
  serviceId: string;
  projectId: string;
}

export function MemoryLimitCard({
  serviceId,
  projectId,
}: MemoryLimitCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [memoryLimit, setMemoryLimit] = useState("none");
  const initialValue = useRef("none");

  const { data: hostResources } = useQuery({
    queryKey: ["hostResources"],
    queryFn: () => api.health.hostResources(),
  });

  useEffect(() => {
    if (service) {
      const value = service.memoryLimit ?? "none";
      setMemoryLimit(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = memoryLimit !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        memoryLimit: memoryLimit === "none" ? null : memoryLimit,
      });
      initialValue.current = memoryLimit;
      toast.success("Memory limit saved", {
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

  const filteredOptions = MEMORY_OPTIONS.filter(
    (opt) => !opt.minGB || (hostResources?.totalMemoryGB ?? 0) >= opt.minGB,
  );

  if (!service) return null;

  return (
    <SettingCard
      title="Memory Limit"
      description="Maximum memory the container can use. If the container exceeds this limit, it will be killed and restarted. Leave unlimited for development, set limits in production."
      learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#memory"
      learnMoreText="Learn more about Memory Limit"
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending || !hasChanges}
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <Select value={memoryLimit} onValueChange={setMemoryLimit}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filteredOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingCard>
  );
}
