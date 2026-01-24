"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeployService,
  useService,
  useUpdateService,
} from "@/hooks/use-services";

interface HostnameCardProps {
  serviceId: string;
}

export function HostnameCard({ serviceId }: HostnameCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(
    serviceId,
    service?.environmentId ?? "",
  );
  const deployMutation = useDeployService(
    serviceId,
    service?.environmentId ?? "",
  );

  const [hostname, setHostname] = useState("");
  const initialHostname = useRef("");

  useEffect(() => {
    if (service?.hostname) {
      setHostname(service.hostname);
      initialHostname.current = service.hostname;
    }
  }, [service]);

  const hasChanges = hostname !== initialHostname.current;

  async function handleSave() {
    if (!hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(hostname.trim())) {
      toast.error("Invalid hostname format");
      return;
    }
    try {
      await updateMutation.mutateAsync({ hostname: hostname.trim() });
      initialHostname.current = hostname.trim();
      toast.success("Hostname updated", {
        description: "Redeploy required for changes to take effect",
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutate(),
        },
      });
    } catch {
      toast.error("Failed to update");
    }
  }

  if (!service) return null;

  return (
    <SettingCard
      title="Hostname"
      description="DNS-safe identifier for inter-service communication within the environment network."
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
      <Input
        value={hostname}
        onChange={(e) => setHostname(e.target.value.toLowerCase())}
        placeholder="my-service"
        pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
        className="font-mono"
      />
    </SettingCard>
  );
}
