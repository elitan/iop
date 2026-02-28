"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { LeftMenuFooter } from "@/components/left-menu-footer";
import { ShellTopRow } from "@/components/shell-top-row";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";

function getActiveProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match) {
    return null;
  }
  if (match[1] === "new") {
    return null;
  }
  return match[1];
}

export function WorkspaceLeftMenu() {
  const pathname = usePathname();
  const { data: projects = [] } = useProjects();

  const activeProjectId = useMemo(
    function getCurrentProjectId() {
      return getActiveProjectId(pathname);
    },
    [pathname],
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/40">
      <ShellTopRow>
        <div className="flex w-full items-center justify-center">
          <Link
            href="/"
            className="inline-flex h-full items-center justify-center leading-none text-neutral-100 transition-colors hover:text-neutral-300"
          >
            <BrandLockup />
          </Link>
        </div>
      </ShellTopRow>

      <div className="border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Projects
          </p>
          <Button size="sm" asChild>
            <Link href="/projects/new">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-auto px-3 py-3">
        {projects.map(function renderProject(project) {
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className={cn(
                "block rounded-md border px-3 py-2 text-sm transition-colors",
                activeProjectId === project.id
                  ? "border-neutral-600 bg-neutral-800/70 text-neutral-100"
                  : "border-transparent text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-100",
              )}
            >
              {project.name}
            </Link>
          );
        })}
      </div>

      <LeftMenuFooter />
    </aside>
  );
}
