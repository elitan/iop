"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CanvasPositions } from "@/hooks/use-canvas-positions";
import { useProject } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { getPreferredDomain } from "@/lib/service-url";
import { CanvasView } from "./_components/canvas-view";
import { ServiceCard } from "./_components/service-card";
import { ServiceSidebar } from "./_components/service-sidebar";

export default function ProjectServicesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { data: project } = useProject(projectId);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [domains, setDomains] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);

  const selectedServiceId = searchParams.get("service");

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
  }, []);

  useEffect(() => {
    if (!project?.services) return;
    async function fetchDomains() {
      const domainMap: Record<string, string> = {};
      for (const service of project!.services || []) {
        const serviceDomains = await api.domains.list(service.id);
        const preferred = getPreferredDomain(serviceDomains);
        if (preferred) {
          domainMap[service.id] = preferred.domain;
        }
      }
      setDomains(domainMap);
    }
    fetchDomains();
  }, [project]);

  const handleSelectService = useCallback(
    (serviceId: string | null) => {
      const url = serviceId
        ? `/projects/${projectId}?service=${serviceId}`
        : `/projects/${projectId}`;
      router.push(url);
    },
    [projectId, router],
  );

  const handleOpenCreateModal = useCallback(() => {
    router.push(`/projects/${projectId}?create=true`);
  }, [projectId, router]);

  if (!project) return null;

  const services = project.services || [];
  const canvasPositions: CanvasPositions = project.canvasPositions
    ? JSON.parse(project.canvasPositions)
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
                <Button asChild size="sm">
                  <Link href={`/projects/${projectId}/services/new`}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Service
                  </Link>
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
