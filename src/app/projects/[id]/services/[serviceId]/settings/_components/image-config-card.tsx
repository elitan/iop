"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Registry {
  id: string;
  name: string;
  type: string;
}

interface ImageConfigCardProps {
  serviceId: string;
  projectId: string;
}

export function ImageConfigCard({
  serviceId,
  projectId,
}: ImageConfigCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [imageUrl, setImageUrl] = useState("");
  const [registryId, setRegistryId] = useState("");
  const initialValues = useRef({ imageUrl: "", registryId: "" });

  const { data: registries } = useQuery({
    queryKey: ["registries"],
    queryFn: async () => {
      const res = await fetch("/api/registries");
      return res.json() as Promise<Registry[]>;
    },
  });

  useEffect(() => {
    if (service) {
      const url = service.imageUrl ?? "";
      const reg = service.registryId ?? "";
      setImageUrl(url);
      setRegistryId(reg);
      initialValues.current = { imageUrl: url, registryId: reg };
    }
  }, [service]);

  const hasChanges =
    imageUrl !== initialValues.current.imageUrl ||
    registryId !== initialValues.current.registryId;

  async function handleSave() {
    if (!imageUrl.trim()) {
      toast.error("Image URL is required");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        imageUrl: imageUrl.trim(),
        registryId: registryId || null,
      });
      initialValues.current = { imageUrl, registryId };
      toast.success("Image configuration saved", {
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

  if (!service || service.deployType !== "image") return null;

  return (
    <SettingCard
      title="Image Configuration"
      description="Docker image and registry for pulling this service."
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
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-sm text-neutral-400">Image URL</span>
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="nginx:latest"
            className="max-w-md font-mono"
          />
        </div>
        <div>
          <span className="mb-2 block text-sm text-neutral-400">Registry</span>
          <Select value={registryId} onValueChange={setRegistryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Auto-detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto-detect</SelectItem>
              {registries?.map((reg) => (
                <SelectItem key={reg.id} value={reg.id}>
                  {reg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingCard>
  );
}
