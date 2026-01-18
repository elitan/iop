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

const REQUEST_TIMEOUT_OPTIONS = [
  { value: "none", label: "No limit" },
  { value: "60", label: "60 seconds" },
  { value: "300", label: "5 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "60 minutes" },
];

interface RequestTimeoutCardProps {
  serviceId: string;
  projectId: string;
}

export function RequestTimeoutCard({
  serviceId,
  projectId,
}: RequestTimeoutCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [requestTimeout, setRequestTimeout] = useState("none");
  const initialValue = useRef("none");

  useEffect(() => {
    if (service) {
      const value = service.requestTimeout?.toString() ?? "none";
      setRequestTimeout(value);
      initialValue.current = value;
    }
  }, [service]);

  const hasChanges = requestTimeout !== initialValue.current;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        requestTimeout:
          requestTimeout === "none" ? null : Number(requestTimeout),
      });
      initialValue.current = requestTimeout;
      toast.success("Request timeout saved", {
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
      title="Request Timeout"
      description="Maximum time allowed for HTTP requests. If exceeded, the proxy returns a 504 Gateway Timeout. Useful for long-running operations like file uploads or report generation."
      learnMoreUrl="https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/504"
      learnMoreText="Learn more about Request Timeout"
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
      <Select value={requestTimeout} onValueChange={setRequestTimeout}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REQUEST_TIMEOUT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingCard>
  );
}
