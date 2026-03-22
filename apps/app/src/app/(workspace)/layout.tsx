"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MainContentHeader } from "@/components/main-content-header";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";
import { CreateServiceModalProvider } from "./_components/create-service-modal-provider";
import { WorkspaceLeftMenu } from "./_components/workspace-left-menu";
import { CreateServiceModal } from "./projects/[id]/_components/create-service-modal";
import { ProjectLeftMenu } from "./projects/[id]/_components/project-left-menu";
import { CreateEnvironmentDialog } from "./projects/[id]/environments/_components/create-environment-dialog";

function toTitleLabel(value: string): string {
  return value
    .split("-")
    .map(function toWord(word) {
      if (word.length === 0) {
        return word;
      }
      return `${word[0].toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const rawProjectId = params.id;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : "";
  const isProjectPage =
    pathname.startsWith("/projects/") && projectId.length > 0;
  const isResourceDetailPage =
    /^\/projects\/[^/]+\/environments\/[^/]+\/(services|databases)\//.test(
      pathname,
    );
  const isSettingsPage =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    /^\/projects\/[^/]+\/settings(\/|$)/.test(pathname);
  const shouldCenterContent = isSettingsPage && !isResourceDetailPage;
  const showMainContentHeader = !isResourceDetailPage;

  const [createServiceModalOpen, setCreateServiceModalOpen] = useState(false);
  const [createEnvDialogOpen, setCreateEnvDialogOpen] = useState(false);

  const { data: environments = [], isLoading: isEnvironmentsLoading } =
    useQuery({
      ...orpc.environments.list.queryOptions({ input: { projectId } }),
      enabled: isProjectPage,
    });
  const { data: project } = useQuery({
    ...orpc.projects.get.queryOptions({ input: { projectId } }),
    enabled: isProjectPage,
    refetchInterval: 2000,
  });

  const currentEnvId = useMemo(
    function getCurrentEnvId() {
      if (!isProjectPage) {
        return "";
      }
      if (typeof params.envId === "string") {
        return params.envId;
      }
      const production = environments.find(
        (environment) => environment.type === "production",
      );
      return production?.id ?? environments[0]?.id ?? "";
    },
    [isProjectPage, params.envId, environments],
  );

  const selectedServiceId =
    typeof params.serviceId === "string" ? params.serviceId : null;
  const selectedDatabaseId = useMemo(
    function getSelectedDatabaseId() {
      if (typeof params.databaseId === "string") {
        return params.databaseId;
      }
      return null;
    },
    [params.databaseId],
  );

  const mainHeaderTitle = useMemo(
    function getMainHeaderTitle() {
      if (pathname === "/") {
        return "Projects";
      }

      if (pathname === "/projects/new") {
        return "New Project";
      }

      if (isProjectPage) {
        const projectLabel = project?.name ?? "Project";
        const pathAfterProject = pathname.replace(/^\/projects\/[^/]+/, "");

        if (pathAfterProject.startsWith("/settings")) {
          return (
            <span className="flex items-center gap-2">
              <span className="truncate text-neutral-100">{projectLabel}</span>
              <span className="text-neutral-500">/</span>
              <span className="text-neutral-400">Settings</span>
            </span>
          );
        }

        if (pathAfterProject.startsWith("/environments")) {
          return (
            <span className="flex items-center gap-2">
              <span className="truncate text-neutral-100">{projectLabel}</span>
              <span className="text-neutral-500">/</span>
              <span className="text-neutral-400">Environments</span>
            </span>
          );
        }

        if (pathAfterProject.startsWith("/databases")) {
          return (
            <span className="flex items-center gap-2">
              <span className="truncate text-neutral-100">{projectLabel}</span>
              <span className="text-neutral-500">/</span>
              <span className="text-neutral-400">Databases</span>
            </span>
          );
        }

        return projectLabel;
      }

      if (pathname.startsWith("/settings/")) {
        const section = pathname.replace(/^\/settings\//, "").split("/")[0];
        return (
          <span className="flex items-center gap-2">
            <span className="text-neutral-100">Settings</span>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-400">{toTitleLabel(section)}</span>
          </span>
        );
      }

      if (pathname === "/settings") {
        return "Settings";
      }

      return "Workspace";
    },
    [pathname, isProjectPage, project?.name],
  );

  const bodyClassName = cn(
    "min-h-0 min-w-0 flex-1",
    isResourceDetailPage
      ? "overflow-hidden bg-neutral-950/20"
      : "overflow-auto p-6",
  );

  function handleCreateServiceModalOpenChange(open: boolean) {
    setCreateServiceModalOpen(open);
  }

  const createServiceModalContextValue = useMemo(
    function getCreateServiceModalContextValue() {
      return {
        openCreateServiceModal: function openCreateServiceModal() {
          setCreateServiceModalOpen(true);
        },
      };
    },
    [],
  );

  return (
    <CreateServiceModalProvider value={createServiceModalContextValue}>
      <main className="fixed inset-0 flex min-h-0">
        {isProjectPage ? (
          isEnvironmentsLoading ? (
            <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-950/40" />
          ) : (
            <ProjectLeftMenu
              projectId={projectId}
              currentEnvId={currentEnvId}
              selectedServiceId={selectedServiceId}
              selectedDatabaseId={selectedDatabaseId}
              onOpenCreateService={function openCreateService() {
                createServiceModalContextValue.openCreateServiceModal();
              }}
              onOpenCreateEnvironment={function openCreateEnvironment() {
                setCreateEnvDialogOpen(true);
              }}
            />
          )
        ) : (
          <WorkspaceLeftMenu />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-950/20">
          {showMainContentHeader && (
            <MainContentHeader title={mainHeaderTitle} />
          )}
          <div className={bodyClassName}>
            {isProjectPage && isEnvironmentsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : shouldCenterContent ? (
              <div className="mx-auto w-full max-w-[1200px]">{children}</div>
            ) : (
              children
            )}
          </div>
        </div>
      </main>

      {isProjectPage && currentEnvId && (
        <CreateServiceModal
          projectId={projectId}
          environmentId={currentEnvId}
          open={createServiceModalOpen}
          onOpenChange={handleCreateServiceModalOpenChange}
          onServiceCreated={function handleServiceCreated(serviceId) {
            router.push(
              `/projects/${projectId}/environments/${currentEnvId}/services/${serviceId}`,
            );
          }}
          onDatabaseCreated={function handleDatabaseCreated(databaseId) {
            router.push(
              `/projects/${projectId}/environments/${currentEnvId}/databases/${databaseId}`,
            );
          }}
        />
      )}

      {isProjectPage && (
        <CreateEnvironmentDialog
          projectId={projectId}
          environments={environments}
          currentEnvId={currentEnvId}
          open={createEnvDialogOpen}
          onOpenChange={setCreateEnvDialogOpen}
        />
      )}
    </CreateServiceModalProvider>
  );
}
