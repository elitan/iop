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

interface BuildConfigCardProps {
  serviceId: string;
  projectId: string;
}

export function BuildConfigCard({
  serviceId,
  projectId,
}: BuildConfigCardProps) {
  const { data: service } = useService(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [branch, setBranch] = useState("");
  const [dockerfilePath, setDockerfilePath] = useState("");
  const initialValues = useRef({ branch: "", dockerfilePath: "" });

  useEffect(() => {
    if (service) {
      const b = service.branch ?? "main";
      const d = service.dockerfilePath ?? "Dockerfile";
      setBranch(b);
      setDockerfilePath(d);
      initialValues.current = { branch: b, dockerfilePath: d };
    }
  }, [service]);

  const hasChanges =
    branch !== initialValues.current.branch ||
    dockerfilePath !== initialValues.current.dockerfilePath;

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        branch: branch.trim() || "main",
        dockerfilePath: dockerfilePath.trim() || "Dockerfile",
      });
      initialValues.current = { branch, dockerfilePath };
      toast.success("Build configuration saved", {
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

  if (!service || service.deployType !== "repo") return null;

  return (
    <SettingCard
      title="Build Configuration"
      description="Git branch and Dockerfile path for building this service."
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
          <span className="mb-2 block text-sm text-neutral-400">Branch</span>
          <Input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="max-w-sm font-mono"
          />
        </div>
        <div>
          <span className="mb-2 block text-sm text-neutral-400">
            Dockerfile Path
          </span>
          <Input
            value={dockerfilePath}
            onChange={(e) => setDockerfilePath(e.target.value)}
            placeholder="Dockerfile"
            className="max-w-sm font-mono"
          />
        </div>
      </div>
    </SettingCard>
  );
}
