"use client";

import { Loader2, Rocket } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { Header } from "@/components/header";
import { ProjectPicker } from "@/components/project-picker";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, useProjects } from "@/hooks/use-projects";
import { useDeployService, useService } from "@/hooks/use-services";

export default function ServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const { data: project } = useProject(projectId);
  const { data: projects = [] } = useProjects();
  const { data: service, isLoading } = useService(serviceId);
  const deployMutation = useDeployService(serviceId, projectId);

  function handleProjectChange(newProjectId: string) {
    router.push(`/projects/${newProjectId}`);
  }

  const projectPicker = projects.length > 0 && project && (
    <ProjectPicker
      projects={projects}
      currentProjectId={projectId}
      currentProjectName={project.name}
      onSelect={handleProjectChange}
      onCreateNew={() => router.push("/projects/new")}
    />
  );

  const tabs = [
    { label: "Overview", href: `/projects/${projectId}/services/${serviceId}` },
    {
      label: "Deployments",
      href: `/projects/${projectId}/services/${serviceId}/deployments`,
    },
    {
      label: "Logs",
      href: `/projects/${projectId}/services/${serviceId}/logs`,
    },
    {
      label: "Settings",
      href: `/projects/${projectId}/services/${serviceId}/settings`,
    },
  ];

  function handleDeploy() {
    deployMutation.mutate(undefined, {
      onSuccess: () => toast.success("Deployment started"),
      onError: () => toast.error("Failed to start deployment"),
    });
  }

  if (isLoading) {
    return (
      <>
        <Header>
          <BreadcrumbHeader
            projectPicker={projectPicker}
            projectName={!projectPicker ? (project?.name ?? "...") : undefined}
            projectHref={!projectPicker ? `/projects/${projectId}` : undefined}
            serviceName="..."
          />
          <div className="border-b border-neutral-800">
            <div className="container mx-auto flex gap-6 px-4">
              <Skeleton className="h-10 w-20" />
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

  if (!service) {
    return (
      <>
        <Header>
          <BreadcrumbHeader
            projectPicker={projectPicker}
            projectName={!projectPicker ? (project?.name ?? "...") : undefined}
            projectHref={!projectPicker ? `/projects/${projectId}` : undefined}
          />
        </Header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-neutral-400">Service not found</div>
        </main>
      </>
    );
  }

  const actions = (
    <Button
      onClick={handleDeploy}
      disabled={deployMutation.isPending}
      size="sm"
    >
      {deployMutation.isPending ? (
        <>
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          Deploying
        </>
      ) : (
        <>
          <Rocket className="mr-1.5 h-4 w-4" />
          Deploy
        </>
      )}
    </Button>
  );

  return (
    <>
      <Header>
        <BreadcrumbHeader
          projectPicker={projectPicker}
          serviceName={service.name}
          actions={actions}
        />
        <TabNav tabs={tabs} layoutId="service-tabs" />
      </Header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </>
  );
}
