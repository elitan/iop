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
import type { EnvVar } from "@/lib/api";

interface ContainerPortCardProps {
  serviceId: string;
}

export function ContainerPortCard({ serviceId }: ContainerPortCardProps) {
  const { data: service } = useService(serviceId);
  const envId = service?.environmentId ?? "";
  const updateMutation = useUpdateService(serviceId, envId);
  const deployMutation = useDeployService(serviceId, envId);

  const [port, setPort] = useState("");
  const initialPort = useRef("");

  useEffect(() => {
    if (service) {
      const p = service.containerPort?.toString() ?? "8080";
      setPort(p);
      initialPort.current = p;
    }
  }, [service]);

  const hasChanges = port !== initialPort.current;

  async function handleSave() {
    const portNum = parseInt(port, 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error("Port must be between 1 and 65535");
      return;
    }

    const currentEnvVars: EnvVar[] = service?.envVars
      ? JSON.parse(service.envVars)
      : [];
    const envVarsWithoutPort = currentEnvVars.filter((v) => v.key !== "PORT");
    const newEnvVars = [...envVarsWithoutPort, { key: "PORT", value: port }];

    try {
      await updateMutation.mutateAsync({
        containerPort: portNum,
        envVars: newEnvVars,
      });
      initialPort.current = port;
      toast.success("Container port saved", {
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
      title="Container Port"
      description="The port your application listens on inside the container."
      footerLeft={
        <span className="text-xs text-neutral-500">
          Also sets the PORT env var so your app knows which port to bind to.
        </span>
      }
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
        type="number"
        value={port}
        onChange={(e) => setPort(e.target.value)}
        placeholder="8080"
        className="w-32 font-mono"
        min={1}
        max={65535}
      />
    </SettingCard>
  );
}
