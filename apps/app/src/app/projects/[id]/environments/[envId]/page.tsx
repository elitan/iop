"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CanvasPositions } from "@/hooks/use-canvas-positions";
import { api } from "@/lib/api";
import { orpc } from "@/lib/orpc-client";
import { getPreferredDomain } from "@/lib/service-url";
import { CanvasView } from "../../_components/canvas-view";
import { ServiceCard } from "../../_components/service-card";
import { ServiceSidebar } from "../../_components/service-sidebar";

export default function EnvironmentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;

  const [isMobile, setIsMobile] = useState(false);

  const { data: environment } = useQuery(
    orpc.environments.get.queryOptions({ input: { id: envId } }),
  );

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
      const url = serviceId
        ? `/projects/${projectId}/environments/${envId}?service=${serviceId}`
        : `/projects/${projectId}/environments/${envId}`;
      router.push(url);
    },
    [projectId, envId, router],
  );

  const handleOpenCreateModal = useCallback(() => {
    router.push(`/projects/${projectId}/environments/${envId}?create=true`);
  }, [projectId, envId, router]);

  if (!environment) return null;

  const canvasPositions: CanvasPositions = project?.canvasPositions
    ? (JSON.parse(project.canvasPositions) as CanvasPositions)
    : {};

  if (services.length === 0) {
    if (isMobile) {
      return (
        <Card className="bg-neutral-900 border-neutral-800">
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
      );
    }
    return (
      <CanvasView
        projectId={projectId}
        environmentId={envId}
        services={[]}
        initialPositions={{}}
        domains={{}}
        serverIp={serverIp}
        selectedServiceId={null}
        onSelectService={handleSelectService}
        onOpenCreateModal={handleOpenCreateModal}
      />
    );
  }

  if (isMobile) {
    return (
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
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CanvasView
        projectId={projectId}
        environmentId={envId}
        services={services}
        initialPositions={canvasPositions}
        domains={domains}
        serverIp={serverIp}
        selectedServiceId={selectedServiceId}
        onSelectService={handleSelectService}
        onOpenCreateModal={handleOpenCreateModal}
      />
      <ServiceSidebar
        projectId={projectId}
        serviceId={selectedServiceId}
        onClose={() => handleSelectService(null)}
      />
    </div>
  );
}
