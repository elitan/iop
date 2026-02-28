"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  useDatabases,
  useEnvironmentDatabaseAttachments,
} from "@/hooks/use-databases";
import { api } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { getPreferredDomain } from "@/lib/service-url";
import { DatabaseCard } from "./_components/database-card";
import { ServiceCard } from "./_components/service-card";

export default function ProjectStartPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();

  const { data: environments = [], isLoading: isEnvironmentsLoading } =
    useQuery(orpc.environments.list.queryOptions({ input: { projectId } }));

  const currentEnvId = useMemo(
    function getCurrentEnvId() {
      const production = environments.find(
        (environment) => environment.type === "production",
      );
      return production?.id ?? environments[0]?.id ?? "";
    },
    [environments],
  );

  const currentEnvironment = useMemo(
    function getCurrentEnvironment() {
      return environments.find(
        (environment) => environment.id === currentEnvId,
      );
    },
    [currentEnvId, environments],
  );

  const { data: environment, isLoading: isEnvironmentLoading } = useQuery({
    ...orpc.environments.get.queryOptions({ input: { envId: currentEnvId } }),
    enabled: currentEnvId.length > 0,
    refetchInterval: 2000,
  });
  const { data: databases = [], isLoading: isDatabasesLoading } =
    useDatabases(projectId);
  const { data: databaseAttachments = [] } =
    useEnvironmentDatabaseAttachments(currentEnvId);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: function fetchSettings() {
      return api.settings.get();
    },
  });

  const services = useMemo(
    function getServices() {
      return environment?.services ?? [];
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

  const databaseAttachmentById = useMemo(
    function getDatabaseAttachmentById() {
      return new Map(
        databaseAttachments.map(function toEntry(attachment) {
          return [attachment.databaseId, attachment];
        }),
      );
    },
    [databaseAttachments],
  );

  const hasResources = services.length > 0 || databases.length > 0;
  const serverIp = settings?.serverIp ?? null;
  const isLoading =
    isEnvironmentsLoading || isEnvironmentLoading || isDatabasesLoading;

  function openDatabase(databaseId: string) {
    if (!currentEnvId) {
      return;
    }
    router.push(
      `/projects/${projectId}/environments/${currentEnvId}/databases/${databaseId}`,
    );
  }

  if (isLoading) {
    return (
      <Card className="border-neutral-800 bg-neutral-900">
        <CardContent className="py-10 text-center text-sm text-neutral-400">
          Loading resources...
        </CardContent>
      </Card>
    );
  }

  if (environments.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No environments"
        description="Create an environment to get started."
        action={{
          label: "Manage Environments",
          href: `/projects/${projectId}/settings/environments`,
        }}
      />
    );
  }

  if (!hasResources) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Environment
            </p>
            <p className="truncate text-sm text-neutral-200">
              {currentEnvironment?.name ?? "Unknown"}
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/settings/environments`}
            className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
          >
            Manage Environments
          </Link>
        </div>
        <Card className="border-neutral-800 bg-neutral-900">
          <CardContent className="py-10 text-center text-sm text-neutral-400">
            No services or databases yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Environment
          </p>
          <p className="truncate text-sm text-neutral-200">
            {currentEnvironment?.name ?? "Unknown"}
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/settings/environments`}
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
        >
          Manage Environments
        </Link>
      </div>

      {services.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Services
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map(function renderService(service) {
              return (
                <ServiceCard
                  key={service.id}
                  service={service}
                  projectId={projectId}
                  domain={domains[service.id] ?? null}
                  serverIp={serverIp}
                />
              );
            })}
          </div>
        </section>
      )}

      {databases.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Databases
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {databases.map(function renderDatabase(database) {
              return (
                <DatabaseCard
                  key={database.id}
                  database={database}
                  attachment={databaseAttachmentById.get(database.id) ?? null}
                  onOpen={openDatabase}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
