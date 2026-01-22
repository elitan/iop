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
import { Header } from "@/components/header";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/hooks/use-projects";
import { orpc } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";
import { CreateServiceModal } from "./_components/create-service-modal";

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

  const isServicesPage = pathname === `/projects/${projectId}`;

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { data: project, isLoading } = useProject(projectId);

  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );

  const currentEnvId = useMemo(() => {
    if (params.envId) return params.envId as string;
    const production = environments.find((e) => e.type === "production");
    return production?.id ?? "";
  }, [params.envId, environments]);

  const envOptions = useMemo(
    () =>
      environments.map((env) => ({
        label: env.name,
        value: env.id,
      })),
    [environments],
  );

  function handleEnvChange(envId: string) {
    const env = environments.find((e) => e.id === envId);
    if (env?.type === "production") {
      router.push(`/projects/${projectId}`);
    } else {
      router.push(`/projects/${projectId}/environments/${envId}`);
    }
  }

  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setCreateModalOpen(true);
      router.replace(`/projects/${projectId}`);
    }
  }, [searchParams, projectId, router]);

  if (isServiceRoute) {
    return <>{children}</>;
  }

  const tabs = [
    { label: "Overview", href: `/projects/${projectId}` },
    { label: "Environments", href: `/projects/${projectId}/environments` },
    { label: "Settings", href: `/projects/${projectId}/settings` },
  ];

  if (isLoading) {
    return (
      <>
        <Header>
          <BreadcrumbHeader items={[{ label: "..." }]} />
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

  if (!project) {
    return (
      <>
        <Header>
          <BreadcrumbHeader items={[]} />
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
      onClick={() => setCreateModalOpen(true)}
    >
      <Plus className="mr-1.5 h-4 w-4" />
      Create
    </Button>
  );

  const breadcrumbItems = [
    { label: project.name },
    ...(envOptions.length > 0
      ? [
          {
            type: "dropdown" as const,
            value: currentEnvId,
            options: envOptions,
            onChange: handleEnvChange,
          },
        ]
      : []),
  ];

  return (
    <>
      <Header>
        <BreadcrumbHeader items={breadcrumbItems} />
        <TabNav tabs={tabs} layoutId="project-tabs" actions={tabActions} />
      </Header>
      <main
        className={cn(
          isServicesPage ? "fixed inset-0" : "container mx-auto px-4 py-8",
        )}
      >
        {children}
      </main>
      <CreateServiceModal
        projectId={projectId}
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onServiceCreated={(serviceId) => {
          router.push(`/projects/${projectId}?service=${serviceId}`);
        }}
      />
    </>
  );
}
