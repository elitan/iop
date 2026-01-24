"use client";

import { LayoutGrid, List, Plus, Rocket, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjects } from "@/hooks/use-projects";
import { ProjectArchitectureCard } from "./_components/project-architecture-card";
import { ProjectListRow } from "./_components/project-list-item";
import {
  SkeletonArchitectureCard,
  SkeletonListItem,
} from "./_components/skeleton-card";

type ViewMode = "architecture" | "list";
const VIEW_STORAGE_KEY = "frost-projects-view";

export default function Home() {
  const { data: projects, isLoading } = useProjects();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("architecture");

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "architecture" || saved === "list") {
      setView(saved);
    }
  }, []);

  function handleViewChange(value: string) {
    const v = value as ViewMode;
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  }

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search) return projects;
    const lower = search.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lower));
  }, [projects, search]);

  function renderContent() {
    if (isLoading) {
      if (view === "list") {
        return (
          <div className="flex flex-col gap-2">
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        );
      }
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonArchitectureCard />
          <SkeletonArchitectureCard />
          <SkeletonArchitectureCard />
        </div>
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

    if (view === "architecture") {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectArchitectureCard key={project.id} project={project} />
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {filteredProjects.map((project) => (
          <ProjectListRow key={project.id} project={project} />
        ))}
      </div>
    );
  }

  return (
    <>
      <Header>
        <BreadcrumbHeader />
      </Header>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input
              placeholder="Search Projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={view} onValueChange={handleViewChange}>
            <TabsList className="bg-neutral-800">
              <TabsTrigger value="architecture" className="gap-1.5">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Architecture</span>
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Add New...
            </Link>
          </Button>
        </div>

        {renderContent()}
      </main>
    </>
  );
}
