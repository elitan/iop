"use client";

import { useParams } from "next/navigation";
import { DeleteProjectCard } from "./_components/delete-project-card";
import { ProjectNameCard } from "./_components/project-name-card";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;

  return (
    <div className="space-y-6">
      <ProjectNameCard projectId={projectId} />
      <DeleteProjectCard projectId={projectId} />
    </div>
  );
}
