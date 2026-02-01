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

const DRAIN_OPTIONS = [
  { value: "0", label: "No drain" },
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "120", label: "120 seconds" },
];

interface DrainTimeoutCardProps {
  serviceId: string;
}

export function DrainTimeoutCard({ serviceId }: DrainTimeoutCardProps) {
  const { data: service } = useService(serviceId);
  const envId = service?.environmentId ?? "";
  const updateMutation = useUpdateService(serviceId, envId);
  const deployMutation = useDeployService(serviceId, envId);

  const [drainTimeout, setDrainTimeout] = useState("30");
  const initialValue = useRef("30");

  useEffect(() => {
    if (service) {
      const value = service.drainTimeout?.toString() ?? "30";
      setDrainTimeout(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = drainTimeout !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        drainTimeout: Number(drainTimeout),
      });
      initialValue.current = drainTimeout;
      toast.success("Drain timeout saved", {
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
      title="Drain Timeout"
      description="Time the old container stays alive after traffic switches to the new one. Allows in-flight requests to complete before shutdown."
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
      <Select value={drainTimeout} onValueChange={setDrainTimeout}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DRAIN_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingCard>
  );
}
