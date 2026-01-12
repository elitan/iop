"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (project) {
      setName(project.name);
    }
  }, [project]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await updateMutation.mutateAsync({ name: name.trim() });
      toast.success("Project name updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  if (!project) return null;

  return (
    <SettingCard
      title="Project Name"
      description="Used to identify your project in the dashboard and in service hostnames on the internal network."
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending}
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
        className="max-w-sm"
        placeholder="my-project"
      />
    </SettingCard>
  );
}
