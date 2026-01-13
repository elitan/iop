"use client";

import { useParams } from "next/navigation";
import { ConfigurationCard } from "./_components/configuration-card";
import { CpuLimitCard } from "./_components/cpu-limit-card";
import { DangerZoneCard } from "./_components/danger-zone-card";
import { HealthCheckCard } from "./_components/health-check-card";
import { MemoryLimitCard } from "./_components/memory-limit-card";
import { RequestTimeoutCard } from "./_components/request-timeout-card";
import { ShutdownTimeoutCard } from "./_components/shutdown-timeout-card";
import { VolumesCard } from "./_components/volumes-card";

export default function ServiceSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="space-y-6">
      <ConfigurationCard serviceId={serviceId} />
      <HealthCheckCard serviceId={serviceId} projectId={projectId} />
      <VolumesCard serviceId={serviceId} projectId={projectId} />
      <ShutdownTimeoutCard serviceId={serviceId} projectId={projectId} />
      <RequestTimeoutCard serviceId={serviceId} projectId={projectId} />
      <MemoryLimitCard serviceId={serviceId} projectId={projectId} />
      <CpuLimitCard serviceId={serviceId} projectId={projectId} />
      <DangerZoneCard serviceId={serviceId} projectId={projectId} />
    </div>
  );
}
