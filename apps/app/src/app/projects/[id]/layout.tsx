"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { EnvironmentPicker } from "@/components/environment-picker";
import { Header } from "@/components/header";
import { ProjectPicker } from "@/components/project-picker";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, useProjects } from "@/hooks/use-projects";
import { orpc } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";
import { CreateServiceModal } from "./_components/create-service-modal";
import { CreateEnvironmentDialog } from "./environments/_components/create-environment-dialog";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const isServiceRoute =
    (pathname.includes("/services/") && params.serviceId) ||
    pathname.endsWith("/services/new");

  const isEnvironmentPage = pathname.match(
    /^\/projects\/[^/]+\/environments\/[^/]+$/,
  );

  const [createServiceModalOpen, setCreateServiceModalOpen] = useState(false);
  const [createEnvDialogOpen, setCreateEnvDialogOpen] = useState(false);
  const { data: project, isLoading } = useProject(projectId);
  const { data: projects = [] } = useProjects();

  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );

  const currentEnvId = useMemo(() => {
    if (params.envId) return params.envId as string;
    const envFromQuery = searchParams.get("env");
    if (envFromQuery && environments.some((e) => e.id === envFromQuery)) {
      return envFromQuery;
    }
    const production = environments.find((e) => e.type === "production");
    return production?.id ?? "";
  }, [params.envId, searchParams, environments]);

  function handleEnvChange(envId: string) {
    router.push(`/projects/${projectId}/environments/${envId}`);
  }

  function handleProjectChange(newProjectId: string) {
    router.push(`/projects/${newProjectId}`);
  }

  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setCreateServiceModalOpen(true);
      const url = currentEnvId
        ? `/projects/${projectId}/environments/${currentEnvId}`
        : `/projects/${projectId}`;
      router.replace(url);
    }
  }, [searchParams, projectId, currentEnvId, router]);

  if (isServiceRoute) {
    return <>{children}</>;
  }

  const overviewUrl = currentEnvId
    ? `/projects/${projectId}/environments/${currentEnvId}`
    : `/projects/${projectId}`;

  const settingsUrl = currentEnvId
    ? `/projects/${projectId}/settings?env=${currentEnvId}`
    : `/projects/${projectId}/settings`;

  const tabs = [
    { label: "Overview", href: overviewUrl },
    { label: "Settings", href: settingsUrl },
  ];

  if (isLoading) {
    return (
      <>
        <Header>
          <BreadcrumbHeader projectName="..." />
          <div className="border-b border-neutral-800">
            <div className="container mx-auto flex gap-6 px-4">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-20" />
            </div>
          </div>
        </Header>
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-32 w-full" />
        </main>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Header>
          <BreadcrumbHeader />
        </Header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-neutral-400">Project not found</div>
        </main>
      </>
    );
  }

  const tabActions = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setCreateServiceModalOpen(true)}
    >
      <Plus className="mr-1.5 h-4 w-4" />
      Create
    </Button>
  );

  const projectPicker = projects.length > 0 && project && (
    <ProjectPicker
      projects={projects}
      currentProjectId={projectId}
      currentProjectName={project.name}
      onSelect={handleProjectChange}
      onCreateNew={() => router.push("/projects/new")}
    />
  );

  const environmentPicker = environments.length > 0 && (
    <EnvironmentPicker
      environments={environments}
      currentEnvId={currentEnvId}
      onSelect={handleEnvChange}
      onCreateNew={() => setCreateEnvDialogOpen(true)}
    />
  );

  return (
    <>
      <Header>
        <BreadcrumbHeader
          projectPicker={projectPicker}
          environmentPicker={environmentPicker}
        />
        <TabNav tabs={tabs} layoutId="project-tabs" actions={tabActions} />
      </Header>
      <main
        className={cn(
          isEnvironmentPage
            ? "fixed top-[6.5rem] left-0 right-0 bottom-0"
            : "container mx-auto px-4 py-8",
        )}
      >
        {children}
      </main>
      {currentEnvId && (
        <CreateServiceModal
          projectId={projectId}
          environmentId={currentEnvId}
          open={createServiceModalOpen}
          onOpenChange={setCreateServiceModalOpen}
          onServiceCreated={(serviceId) => {
            router.push(
              `/projects/${projectId}/environments/${currentEnvId}?service=${serviceId}`,
            );
          }}
        />
      )}
      <CreateEnvironmentDialog
        projectId={projectId}
        environments={environments}
        currentEnvId={currentEnvId}
        open={createEnvDialogOpen}
        onOpenChange={setCreateEnvDialogOpen}
      />
    </>
  );
}
