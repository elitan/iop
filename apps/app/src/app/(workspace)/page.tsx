"use client";

import { LayoutGrid, List, Plus, Rocket, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import type { ProjectListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectAvatar } from "./_components/project-avatar";
import { ProjectCard } from "./_components/project-card";

type ProjectViewMode = "cards" | "list";

interface ProjectListRowProps {
  project: ProjectListItem;
}

function ProjectListRow({ project }: ProjectListRowProps) {
  const runningCount = project.services.filter(
    (service) => service.status === "running",
  ).length;
  const totalCount = project.services.length;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-800/50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <ProjectAvatar name={project.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-100">
            {project.name}
          </p>
          {project.runningUrl && (
            <p className="truncate text-sm text-neutral-500">
              {project.runningUrl}
            </p>
          )}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-4 text-sm text-neutral-400 md:flex">
        <span>
          {totalCount} service{totalCount === 1 ? "" : "s"}
        </span>
        <span>
          {runningCount}/{totalCount} online
        </span>
      </div>
    </Link>
  );
}

function ProjectCardsLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

function ProjectListLoading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-[66px] w-full rounded-lg" />
      <Skeleton className="h-[66px] w-full rounded-lg" />
      <Skeleton className="h-[66px] w-full rounded-lg" />
    </div>
  );
}

export default function Home() {
  const { data: projects, isLoading } = useProjects();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ProjectViewMode>("cards");

  const filteredProjects = useMemo(
    function getFilteredProjects() {
      if (!projects) {
        return [];
      }
      if (!search) {
        return projects;
      }
      const lower = search.toLowerCase();
      return projects.filter(function matchesSearch(project) {
        return project.name.toLowerCase().includes(lower);
      });
    },
    [projects, search],
  );

  function renderContent() {
    if (isLoading) {
      return viewMode === "cards" ? (
        <ProjectCardsLoading />
      ) : (
        <ProjectListLoading />
      );
    }

    if (!projects || projects.length === 0) {
      return (
        <EmptyState
          icon={Rocket}
          title="No projects yet"
          description="Create a project to get started"
          action={{ label: "New Project", href: "/projects/new" }}
        />
      );
    }

    if (filteredProjects.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description="Try a different search term"
        />
      );
    }

    if (viewMode === "cards") {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map(function renderProject(project) {
            return (
              <ProjectCard
                key={project.id}
                id={project.id}
                name={project.name}
                runningUrl={project.runningUrl}
                repoUrl={project.repoUrl}
                latestDeployment={project.latestDeployment}
              />
            );
          })}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filteredProjects.map(function renderProject(project) {
          return <ProjectListRow key={project.id} project={project} />;
        })}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input
            placeholder="Search projects"
            value={search}
            onChange={function onSearchChange(event) {
              setSearch(event.target.value);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900 p-1">
            <button
              type="button"
              onClick={function showCards() {
                setViewMode("cards");
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                viewMode === "cards"
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-100",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={function showList() {
                setViewMode("list");
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                viewMode === "list"
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-100",
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>

          <Button size="sm" asChild>
            <Link href="/projects/new">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Project
            </Link>
          </Button>
        </div>
      </div>
      {renderContent()}
    </section>
  );
}
