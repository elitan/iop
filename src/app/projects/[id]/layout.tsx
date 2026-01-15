"use client";

import { Loader2, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeployProject, useProject } from "@/hooks/use-projects";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.id as string;

  const isServiceRoute =
    (pathname.includes("/services/") && params.serviceId) ||
    pathname.endsWith("/services/new");

  const { data: project, isLoading } = useProject(projectId);
  const deployProjectMutation = useDeployProject(projectId);

  if (isServiceRoute) {
    return <>{children}</>;
  }

  const tabs = [
    { label: "Services", href: `/projects/${projectId}` },
    { label: "Settings", href: `/projects/${projectId}/settings` },
  ];

  async function handleDeployAll() {
    try {
      await deployProjectMutation.mutateAsync();
      toast.success("Deploying all services");
    } catch {
      toast.error("Failed to start deployment");
    }
  }

  if (isLoading) {
    return (
      <>
        <BreadcrumbHeader items={[{ label: "..." }]} />
        <div className="border-b border-neutral-800">
          <div className="container mx-auto flex gap-6 px-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-32 w-full" />
        </main>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <BreadcrumbHeader items={[]} />
        <main className="container mx-auto px-4 py-8">
          <div className="text-neutral-400">Project not found</div>
        </main>
      </>
    );
  }

  const services = project.services || [];
  const hasServices = services.length > 0;

  const actions = (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/projects/${projectId}/services/new`}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Service
        </Link>
      </Button>
      {hasServices && (
        <Button
          onClick={handleDeployAll}
          disabled={deployProjectMutation.isPending}
          size="sm"
        >
          {deployProjectMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Deploying
            </>
          ) : (
            <>
              <Rocket className="mr-1.5 h-4 w-4" />
              Deploy All
            </>
          )}
        </Button>
      )}
    </>
  );

  return (
    <>
      <BreadcrumbHeader items={[{ label: project.name }]} actions={actions} />
      <TabNav tabs={tabs} layoutId="project-tabs" />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </>
  );
}
