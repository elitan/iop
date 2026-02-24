"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CanvasPositions } from "@/hooks/use-canvas-positions";
import {
  useDatabases,
  useEnvironmentDatabaseAttachments,
} from "@/hooks/use-databases";
import { api } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { getPreferredDomain } from "@/lib/service-url";
import { CanvasView } from "../../_components/canvas-view";
import { DatabaseCard } from "../../_components/database-card";
import { DatabaseSidebar } from "../../_components/database-sidebar";
import { ServiceCard } from "../../_components/service-card";
import { ServiceSidebar } from "../../_components/service-sidebar";

export default function EnvironmentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;

  const [isMobile, setIsMobile] = useState(false);

  const { data: environment } = useQuery({
    ...orpc.environments.get.queryOptions({ input: { id: envId } }),
    refetchInterval: 2000,
  });

  const { data: project } = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } }),
  );

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
  });
  const serverIp = settings?.serverIp ?? null;

  const services = useMemo(
    () => environment?.services || [],
    [environment?.services],
  );
  const { data: databases = [] } = useDatabases(projectId);
  const { data: databaseAttachments = [] } =
    useEnvironmentDatabaseAttachments(envId);

  const serviceIds = useMemo(() => services.map((s) => s.id), [services]);

  const { data: allDomains = [] } = useQuery({
    ...orpc.domains.listByServiceIds.queryOptions({ input: { serviceIds } }),
    enabled: serviceIds.length > 0,
  });

  const domains = useMemo(() => {
    const domainMap: Record<string, string> = {};
    for (const domain of allDomains) {
      if (!domainMap[domain.serviceId]) {
        const serviceDomains = allDomains.filter(
          (d) => d.serviceId === domain.serviceId,
        );
        const preferred = getPreferredDomain(serviceDomains);
        if (preferred) {
          domainMap[domain.serviceId] = preferred.domain;
        }
      }
    }
    return domainMap;
  }, [allDomains]);

  const selectedServiceId = searchParams.get("service");
  const selectedDatabaseId = selectedServiceId
    ? null
    : searchParams.get("database");
  const selectedBranchId = selectedDatabaseId
    ? searchParams.get("branch")
    : null;
  const hasCanvasItems = services.length > 0 || databases.length > 0;

  const databaseAttachmentById = useMemo(() => {
    return new Map(
      databaseAttachments.map((attachment) => [
        attachment.databaseId,
        attachment,
      ]),
    );
  }, [databaseAttachments]);

  const pushWithParams = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      const base = `/projects/${projectId}/environments/${envId}`;
      router.push(query.length > 0 ? `${base}?${query}` : base);
    },
    [projectId, envId, router],
  );

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleSelectService = useCallback(
    (serviceId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (serviceId) {
        next.set("service", serviceId);
        next.delete("database");
      } else {
        next.delete("service");
      }
      pushWithParams(next);
    },
    [searchParams, pushWithParams],
  );

  const handleSelectDatabase = useCallback(
    (databaseId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (databaseId) {
        next.set("database", databaseId);
        next.delete("branch");
        next.delete("service");
      } else {
        next.delete("database");
        next.delete("branch");
      }
      pushWithParams(next);
    },
    [searchParams, pushWithParams],
  );

  const handleSelectBranch = useCallback(
    (branchId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (branchId) {
        next.set("branch", branchId);
      } else {
        next.delete("branch");
      }
      pushWithParams(next);
    },
    [searchParams, pushWithParams],
  );

  const handleOpenCreateModal = useCallback(() => {
    router.push(`/projects/${projectId}/environments/${envId}?create=true`);
  }, [projectId, envId, router]);

  if (!environment) return null;

  const canvasPositions: CanvasPositions = project?.canvasPositions
    ? (JSON.parse(project.canvasPositions) as CanvasPositions)
    : {};

  if (isMobile) {
    return (
      <>
        <div className="space-y-4">
          {!hasCanvasItems ? (
            <Card className="border-neutral-800 bg-neutral-900">
              <CardContent className="py-12">
                <EmptyState
                  title="No services yet"
                  description="Add a service to get started with deployments"
                  action={
                    <Button size="sm" onClick={handleOpenCreateModal}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Service
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  projectId={projectId}
                  domain={domains[service.id] || null}
                  serverIp={serverIp}
                />
              ))}
              {databases.map((database) => (
                <DatabaseCard
                  key={database.id}
                  database={database}
                  attachment={databaseAttachmentById.get(database.id) ?? null}
                  onOpen={handleSelectDatabase}
                />
              ))}
            </div>
          )}
        </div>
        <DatabaseSidebar
          projectId={projectId}
          environmentId={envId}
          databaseId={selectedDatabaseId}
          branchId={selectedBranchId}
          onBranchChange={handleSelectBranch}
          onClose={() => handleSelectDatabase(null)}
        />
      </>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CanvasView
        projectId={projectId}
        environmentId={envId}
        services={services}
        databases={databases}
        databaseAttachments={databaseAttachments}
        initialPositions={canvasPositions}
        domains={domains}
        serverIp={serverIp}
        selectedServiceId={selectedServiceId}
        selectedDatabaseId={selectedDatabaseId}
        onSelectService={handleSelectService}
        onSelectDatabase={handleSelectDatabase}
        onOpenCreateModal={handleOpenCreateModal}
      />
      <ServiceSidebar
        projectId={projectId}
        serviceId={selectedServiceId}
        onClose={() => handleSelectService(null)}
      />
      <DatabaseSidebar
        projectId={projectId}
        environmentId={envId}
        databaseId={selectedDatabaseId}
        branchId={selectedBranchId}
        onBranchChange={handleSelectBranch}
        onClose={() => handleSelectDatabase(null)}
      />
    </div>
  );
}
