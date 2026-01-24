import Link from "next/link";
import { StatusDot } from "@/components/status-dot";
import type { ProjectListItem as ProjectListItemType } from "@/lib/api";

interface ProjectListRowProps {
  project: ProjectListItemType;
}

export function ProjectListRow({ project }: ProjectListRowProps) {
  const runningCount = project.services.filter(
    (s) => s.status === "running",
  ).length;
  const totalCount = project.services.length;
  const hasServices = totalCount > 0;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-800/50"
    >
      <span className="font-medium text-neutral-100">{project.name}</span>
      {hasServices && (
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <StatusDot status={runningCount > 0 ? "running" : "pending"} />
          <span>production</span>
          <span className="text-neutral-500">·</span>
          <span>
            {runningCount}/{totalCount} services online
          </span>
        </div>
      )}
    </Link>
  );
}
