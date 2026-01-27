"use client";

import { Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
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
      <div className="space-y-4">
        <div className="flex items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 focus-within:ring-1 focus-within:ring-neutral-500">
          <div className="inline-flex items-center font-mono text-sm">
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value.toLowerCase())}
              placeholder="<hostname>"
              size={Math.max(hostname.length, 10) + 1}
              className="bg-transparent text-neutral-100 placeholder:text-neutral-500 focus:outline-none border-b border-dashed border-neutral-600 focus:border-neutral-400"
            />
            <span className="text-neutral-500">.frost.internal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-sm text-neutral-500 font-mono">
            {hostname || "<hostname>"}.frost.internal:
            {service.containerPort ?? 8080}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-neutral-500 hover:text-neutral-300"
            onClick={() => {
              navigator.clipboard.writeText(
                `${hostname}.frost.internal:${service.containerPort ?? 8080}`,
              );
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </SettingCard>
  );
}
