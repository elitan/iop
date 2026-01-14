"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject, useUpdateProject } from "@/hooks/use-projects";

interface ProjectNameCardProps {
  projectId: string;
}

export function ProjectNameCard({ projectId }: ProjectNameCardProps) {
  const { data: project } = useProject(projectId);
  const updateMutation = useUpdateProject(projectId);

  const [name, setName] = useState("");
  const initialName = useRef("");

  useEffect(() => {
    if (project) {
      setName(project.name);
      initialName.current = project.name;
    }
  }, [project]);

  const hasChanges = name !== initialName.current;

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await updateMutation.mutateAsync({ name: name.trim() });
      initialName.current = name.trim();
      toast.success("Project name updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  if (!project) return null;

  return (
    <SettingCard
      title="Project Name"
      description="Display name for this project."
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
        />
        {project.hostname && (
          <div>
            <span className="text-sm text-neutral-500">Hostname</span>
            <p className="mt-1 font-mono text-sm text-neutral-300">
              {project.hostname}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Used in wildcard domains and service hostnames
            </p>
          </div>
        )}
      </div>
    </SettingCard>
  );
}
