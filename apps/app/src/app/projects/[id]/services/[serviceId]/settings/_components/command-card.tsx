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

interface CommandCardProps {
  serviceId: string;
}

export function CommandCard({ serviceId }: CommandCardProps) {
  const { data: service } = useService(serviceId);
  const envId = service?.environmentId ?? "";
  const updateMutation = useUpdateService(serviceId, envId);
  const deployMutation = useDeployService(serviceId, envId);

  const [command, setCommand] = useState("");
  const initialValue = useRef("");

  useEffect(() => {
    if (service) {
      const value = service.command ?? "";
      setCommand(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = command !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        command: command || null,
      });
      initialValue.current = command;
      toast.success("Command saved", {
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
      title="Startup Command"
      description="Override the default command that runs when the container starts. Leave empty to use the image's default command."
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
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder='e.g., /bin/sh -c "npm run start"'
        className="font-mono text-sm"
      />
    </SettingCard>
  );
}
