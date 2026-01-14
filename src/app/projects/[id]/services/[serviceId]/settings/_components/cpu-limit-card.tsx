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

const CPU_OPTIONS = [
  { value: "none", label: "No limit" },
  { value: "0.25", label: "0.25 vCPU", minCpus: 1 },
  { value: "0.5", label: "0.5 vCPU", minCpus: 1 },
  { value: "1", label: "1 vCPU", minCpus: 1 },
  { value: "2", label: "2 vCPU", minCpus: 2 },
  { value: "4", label: "4 vCPU", minCpus: 4 },
  { value: "8", label: "8 vCPU", minCpus: 8 },
  { value: "16", label: "16 vCPU", minCpus: 16 },
  { value: "32", label: "32 vCPU", minCpus: 32 },
];

interface CpuLimitCardProps {
  serviceId: string;
  projectId: string;
}

export function CpuLimitCard({ serviceId, projectId }: CpuLimitCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [cpuLimit, setCpuLimit] = useState("none");
  const initialValue = useRef("none");

  const { data: hostResources } = useQuery({
    queryKey: ["hostResources"],
    queryFn: () => api.health.hostResources(),
  });

  useEffect(() => {
    if (service) {
      const value = service.cpuLimit?.toString() ?? "none";
      setCpuLimit(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = cpuLimit !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        cpuLimit: cpuLimit === "none" ? null : Number(cpuLimit),
      });
      initialValue.current = cpuLimit;
      toast.success("CPU limit saved", {
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

  const filteredOptions = CPU_OPTIONS.filter(
    (opt) => !opt.minCpus || (hostResources?.cpus ?? 0) >= opt.minCpus,
  );

  if (!service) return null;

  return (
    <SettingCard
      title="CPU Limit"
      description="Maximum CPU cores the container can use. A vCPU is a logical CPU (includes hyperthreading). Limits CPU-intensive workloads from affecting other services."
      learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#cpu"
      learnMoreText="Learn more about CPU Limit"
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
      <Select value={cpuLimit} onValueChange={setCpuLimit}>
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
