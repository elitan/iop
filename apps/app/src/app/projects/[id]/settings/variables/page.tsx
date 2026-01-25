"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnvVarEditor } from "@/components/env-var-editor";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import {
  useDeployProject,
  useProject,
  useUpdateProject,
} from "@/hooks/use-projects";
import type { EnvVar } from "@/lib/api";

export default function ProjectVariablesPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project } = useProject(projectId);
  const updateMutation = useUpdateProject(projectId);
  const deployProjectMutation = useDeployProject(projectId);

  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);
  const initialEnvVars = useRef<EnvVar[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (project && !initialized.current) {
      const vars: EnvVar[] = project.envVars ? JSON.parse(project.envVars) : [];
      setEnvVars(vars);
      initialEnvVars.current = vars;
      initialized.current = true;
    }
  }, [project]);

  const hasChanges =
    JSON.stringify(envVars) !== JSON.stringify(initialEnvVars.current);

  async function handleSave() {
    const validEnvVars = envVars.filter((v) => v.key.trim() !== "");
    try {
      await updateMutation.mutateAsync({ envVars: validEnvVars });
      initialEnvVars.current = validEnvVars;
      toast.success("Environment variables saved", {
        description: "Redeploy services for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy All",
          onClick: () => deployProjectMutation.mutateAsync(),
        },
      });
    } catch {
      toast.error("Failed to save");
    }
  }

  if (!project) return null;

  return (
    <SettingCard
      title="Project Environment Variables"
      description="These environment variables are inherited by all services in this project."
      learnMoreUrl="/docs/guides/env-vars"
      learnMoreText="Learn more about environment variables"
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={
            updateMutation.isPending || !hasChanges || hasValidationErrors
          }
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <EnvVarEditor
        value={envVars}
        onChange={setEnvVars}
        onValidationChange={setHasValidationErrors}
      />
    </SettingCard>
  );
}
