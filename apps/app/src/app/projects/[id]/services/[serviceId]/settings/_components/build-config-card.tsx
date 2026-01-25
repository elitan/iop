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
}

interface FormValues {
  branch: string;
  dockerfilePath: string;
  buildContext: string;
  frostFilePath: string;
}

const DEFAULT_VALUES: FormValues = {
  branch: "",
  dockerfilePath: "",
  buildContext: "",
  frostFilePath: "",
};

export function BuildConfigCard({ serviceId }: BuildConfigCardProps) {
  const { data: service } = useService(serviceId);
  const envId = service?.environmentId ?? "";
  const updateMutation = useUpdateService(serviceId, envId);
  const deployMutation = useDeployService(serviceId, envId);

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const initialValues = useRef<FormValues>(DEFAULT_VALUES);

  useEffect(() => {
    if (service) {
      const newValues: FormValues = {
        branch: service.branch ?? "main",
        dockerfilePath: service.dockerfilePath ?? "Dockerfile",
        buildContext: service.buildContext ?? "",
        frostFilePath: service.frostFilePath ?? "",
      };
      setValues(newValues);
      initialValues.current = newValues;
    }
  }, [service]);

  const hasChanges =
    values.branch !== initialValues.current.branch ||
    values.dockerfilePath !== initialValues.current.dockerfilePath ||
    values.buildContext !== initialValues.current.buildContext ||
    values.frostFilePath !== initialValues.current.frostFilePath;

  function updateField<K extends keyof FormValues>(
    field: K,
    value: FormValues[K],
  ): void {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        branch: values.branch.trim() || "main",
        dockerfilePath: values.dockerfilePath.trim() || "Dockerfile",
        buildContext: values.buildContext.trim() || null,
        frostFilePath: values.frostFilePath.trim() || null,
      });
      initialValues.current = values;
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
            value={values.branch}
            onChange={(e) => updateField("branch", e.target.value)}
            placeholder="main"
            className="max-w-sm font-mono"
          />
        </div>
        <div>
          <span className="mb-2 block text-sm text-neutral-400">
            Dockerfile Path
          </span>
          <Input
            value={values.dockerfilePath}
            onChange={(e) => updateField("dockerfilePath", e.target.value)}
            placeholder="Dockerfile"
            className="max-w-sm font-mono"
          />
        </div>
        <div>
          <span className="mb-2 block text-sm text-neutral-400">
            Build Context
          </span>
          <Input
            value={values.buildContext}
            onChange={(e) => updateField("buildContext", e.target.value)}
            placeholder=". (repo root)"
            className="max-w-sm font-mono"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Leave empty for repo root.
          </p>
        </div>
        <div>
          <span className="mb-2 block text-sm text-neutral-400">
            Config File Path
          </span>
          <Input
            value={values.frostFilePath}
            onChange={(e) => updateField("frostFilePath", e.target.value)}
            placeholder="frost.yaml"
            className="max-w-sm font-mono"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Override settings at deploy time. Leave empty for frost.yaml at repo
            root.
          </p>
        </div>
      </div>
    </SettingCard>
  );
}
