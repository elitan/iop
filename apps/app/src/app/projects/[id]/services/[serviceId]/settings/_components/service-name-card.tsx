"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useService, useUpdateService } from "@/hooks/use-services";

interface ServiceNameCardProps {
  serviceId: string;
}

export function ServiceNameCard({ serviceId }: ServiceNameCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(
    serviceId,
    service?.environmentId ?? "",
  );

  const [name, setName] = useState("");
  const initialName = useRef("");

  useEffect(() => {
    if (service) {
      setName(service.name);
      initialName.current = service.name;
    }
  }, [service]);

  const hasChanges = name !== initialName.current;

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await updateMutation.mutateAsync({ name: name.trim() });
      initialName.current = name.trim();
      toast.success("Service name updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  if (!service) return null;

  return (
    <SettingCard
      title="Service Name"
      description="Display name for this service."
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
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="my-service"
      />
    </SettingCard>
  );
}
