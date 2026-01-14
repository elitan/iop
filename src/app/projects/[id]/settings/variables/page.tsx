"use client";

import { Loader2, Pencil } from "lucide-react";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EnvVarEditor } from "@/components/env-var-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [editing, setEditing] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const initialEnvVars = useRef<EnvVar[]>([]);

  function handleEdit() {
    if (project) {
      const vars = project.envVars ? JSON.parse(project.envVars) : [];
      setEnvVars(vars);
      initialEnvVars.current = vars;
      setEditing(true);
    }
  }

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
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  if (!project) return null;

  const vars: EnvVar[] = project.envVars ? JSON.parse(project.envVars) : [];

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
          <span>Shared Environment Variables</span>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-neutral-500">
          These variables are inherited by all services in this project.
        </p>
        {editing ? (
          <div className="space-y-4">
            <EnvVarEditor value={envVars} onChange={setEnvVars} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending || !hasChanges}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {vars.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No shared environment variables configured
              </p>
            ) : (
              vars.map((v) => (
                <div key={v.key} className="flex gap-2 font-mono text-sm">
                  <span className="text-neutral-300">{v.key}</span>
                  <span className="text-neutral-600">=</span>
                  <span className="text-neutral-500">••••••••</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
