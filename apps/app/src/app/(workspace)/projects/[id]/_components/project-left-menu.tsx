"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useMemo } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { EnvironmentPicker } from "@/components/environment-picker";
import { LeftMenuFooter } from "@/components/left-menu-footer";
import { ProjectPicker } from "@/components/project-picker";
import { ShellTopRow } from "@/components/shell-top-row";
import { StatusDot } from "@/components/status-dot";
import { useDatabases } from "@/hooks/use-databases";
import { useProject, useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";
import { orpc } from "@/lib/orpc-client";
import { FALLBACK_ICON, getServiceIcon } from "@/lib/service-logo";
import { getPreferredDomain } from "@/lib/service-url";

interface ProjectLeftMenuProps {
  projectId: string;
  currentEnvId: string;
  selectedServiceId: string | null;
  selectedDatabaseId: string | null;
  onOpenCreateService: () => void;
  onOpenCreateEnvironment: () => void;
}

function getResourceItemClass(isActive: boolean): string {
  if (isActive) {
    return "block w-full rounded-lg border border-neutral-500 bg-neutral-800/70 px-3 py-2 text-left";
  }
  return "block w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900";
}

function handleImageFallback(
  event: SyntheticEvent<HTMLImageElement>,
  fallbackSrc: string,
) {
  const image = event.currentTarget;
  if (image.src === fallbackSrc) {
    return;
  }
  image.src = fallbackSrc;
}

interface ResourceListItemProps {
  href: string;
  isActive: boolean;
  iconSrc: string;
  iconFallback: string;
  name: string;
  subtitle: string;
  status: string;
}

function ResourceListItem({
  href,
  isActive,
  iconSrc,
  iconFallback,
  name,
  subtitle,
  status,
}: ResourceListItemProps) {
  return (
    <Link href={href} className={getResourceItemClass(isActive)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-400">
            <img
              src={iconSrc}
              alt=""
              className="h-4 w-4 object-contain"
              onError={function onIconError(event) {
                handleImageFallback(event, iconFallback);
              }}
            />
          </span>
          <span className="truncate text-sm text-neutral-100">{name}</span>
        </div>
        <StatusDot status={status} className="shrink-0" />
      </div>
      <p className="mt-1 truncate text-xs text-neutral-500">{subtitle}</p>
    </Link>
  );
}

export function ProjectLeftMenu({
  projectId,
  currentEnvId,
  selectedServiceId,
  selectedDatabaseId,
  onOpenCreateService,
  onOpenCreateEnvironment,
}: ProjectLeftMenuProps) {
  const router = useRouter();
  const { data: project } = useProject(projectId);
  const { data: projects = [] } = useProjects();
  const { data: databases = [] } = useDatabases(projectId);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: function fetchSettings() {
      return api.settings.get();
    },
  });
  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );
  const { data: environment } = useQuery({
    ...orpc.environments.get.queryOptions({ input: { envId: currentEnvId } }),
    enabled: currentEnvId.length > 0,
    refetchInterval: 2000,
  });

  const services = useMemo(
    function getServices() {
      return environment?.services || [];
    },
    [environment?.services],
  );

  const serviceIds = useMemo(
    function getServiceIds() {
      return services.map(function getServiceId(service) {
        return service.id;
      });
    },
    [services],
  );

  const { data: allDomains = [] } = useQuery({
    ...orpc.domains.listByServiceIds.queryOptions({ input: { serviceIds } }),
    enabled: serviceIds.length > 0,
  });

  const domains = useMemo(
    function getDomains() {
      const domainMap: Record<string, string> = {};
      for (const domain of allDomains) {
        if (!domainMap[domain.serviceId]) {
          const serviceDomains = allDomains.filter(
            function byServiceId(candidate) {
              return candidate.serviceId === domain.serviceId;
            },
          );
          const preferred = getPreferredDomain(serviceDomains);
          if (preferred) {
            domainMap[domain.serviceId] = preferred.domain;
          }
        }
      }
      return domainMap;
    },
    [allDomains],
  );

  const hasResources = services.length > 0 || databases.length > 0;
  const serverIp = settings?.serverIp ?? null;
  const projectStartHref = `/projects/${projectId}`;
  const environmentStartHref = currentEnvId
    ? `/projects/${projectId}/environments/${currentEnvId}`
    : projectStartHref;

  function handleProjectChange(nextProjectId: string) {
    router.push(`/projects/${nextProjectId}`);
  }

  function handleEnvironmentChange(nextEnvId: string) {
    router.push(`/projects/${projectId}/environments/${nextEnvId}`);
  }

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
            Project
          </p>
          <Link
            href={`/projects/${projectId}/settings`}
            className="cursor-pointer text-xs text-neutral-400 transition-colors hover:text-neutral-100"
          >
            Settings
          </Link>
        </div>
        <div className="mt-1">
          {projects.length > 0 && project ? (
            <ProjectPicker
              projects={projects}
              currentProjectId={projectId}
              currentProjectName={project.name}
              textHref={projectStartHref}
              onSelect={handleProjectChange}
              onCreateNew={function createProject() {
                router.push("/projects/new");
              }}
            />
          ) : (
            <p className="text-sm text-neutral-200">{project?.name}</p>
          )}
        </div>
      </div>

      <div className="border-b border-neutral-800 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Environment
        </p>
        <div className="mt-1">
          {environments.length > 0 ? (
            <EnvironmentPicker
              environments={environments}
              currentEnvId={currentEnvId}
              textHref={environmentStartHref}
              onSelect={handleEnvironmentChange}
              onCreateNew={onOpenCreateEnvironment}
            />
          ) : (
            <p className="truncate text-sm text-neutral-200">
              {environment?.name ?? "No environment"}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-auto px-3 py-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Resources
            </p>
            <button
              type="button"
              onClick={onOpenCreateService}
              disabled={!currentEnvId}
              className="cursor-pointer text-xs text-neutral-400 transition-colors hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-700"
            >
              Add
            </button>
          </div>

          {hasResources && (
            <div className="space-y-1">
              {services.map(function renderService(service) {
                const deployment = service.latestDeployment;
                const serviceIcon = getServiceIcon(service) ?? FALLBACK_ICON;
                const url =
                  domains[service.id] ||
                  (serverIp && deployment?.hostPort
                    ? `${serverIp}:${deployment.hostPort}`
                    : null);
                const href = currentEnvId
                  ? `/projects/${projectId}/environments/${currentEnvId}/services/${service.id}`
                  : `/projects/${projectId}`;
                return (
                  <ResourceListItem
                    key={service.id}
                    href={href}
                    isActive={selectedServiceId === service.id}
                    iconSrc={serviceIcon}
                    iconFallback={FALLBACK_ICON}
                    name={service.name}
                    subtitle={url ?? "no public url"}
                    status={deployment?.status ?? "pending"}
                  />
                );
              })}

              {databases.map(function renderDatabase(database) {
                const href = currentEnvId
                  ? `/projects/${projectId}/environments/${currentEnvId}/databases/${database.id}`
                  : `/projects/${projectId}`;
                return (
                  <ResourceListItem
                    key={database.id}
                    href={href}
                    isActive={selectedDatabaseId === database.id}
                    iconSrc={getDatabaseLogoUrl(database.engine)}
                    iconFallback={DATABASE_LOGO_FALLBACK}
                    name={database.name}
                    subtitle={`${database.engine} · manual`}
                    status="ok"
                  />
                );
              })}
            </div>
          )}

          {!hasResources && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
              No resources yet.
            </div>
          )}
        </div>
      </div>

      <LeftMenuFooter />
    </aside>
  );
}
