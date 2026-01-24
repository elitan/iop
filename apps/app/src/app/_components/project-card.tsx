import { GitBranch, Github } from "lucide-react";
import Link from "next/link";
import type { ProjectLatestDeployment } from "@/lib/api";
import { ProjectAvatar } from "./project-avatar";

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function extractRepoPath(url: string): string | null {
  const match = url.match(/github\.com[/:]([\w.-]+\/[\w.-]+)/);
  if (match) return match[1].replace(/\.git$/, "");
  return null;
}

interface ProjectCardProps {
  id: string;
  name: string;
  runningUrl?: string | null;
  repoUrl?: string | null;
  latestDeployment?: ProjectLatestDeployment | null;
}

export function ProjectCard({
  id,
  name,
  runningUrl,
  repoUrl,
  latestDeployment,
}: ProjectCardProps) {
  const repoPath = repoUrl ? extractRepoPath(repoUrl) : null;

  return (
    <Link
      href={`/projects/${id}`}
      className="group block rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-800/50"
    >
      <div className="flex items-start gap-3">
        <ProjectAvatar name={name} />
        <div className="min-w-0 flex-1">
          <h2 className="font-medium text-neutral-100">{name}</h2>
          {runningUrl && (
            <p className="truncate text-sm text-neutral-500">{runningUrl}</p>
          )}
        </div>
      </div>

      {repoPath && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            <Github className="h-3 w-3" />
            {repoPath}
          </span>
        </div>
      )}

      {latestDeployment && (
        <div className="mt-3 space-y-1">
          {latestDeployment.commitMessage && (
            <p className="truncate text-sm text-neutral-300">
              {latestDeployment.commitMessage}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{formatTimeAgo(latestDeployment.createdAt)}</span>
            {latestDeployment.branch && (
              <>
                <span>on</span>
                <span className="inline-flex items-center gap-1 min-w-0 max-w-[150px]">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{latestDeployment.branch}</span>
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
