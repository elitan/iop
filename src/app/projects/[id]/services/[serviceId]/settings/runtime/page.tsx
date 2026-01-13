"use client";

import { useParams } from "next/navigation";
import { CpuLimitCard } from "../_components/cpu-limit-card";
import { HealthCheckCard } from "../_components/health-check-card";
import { MemoryLimitCard } from "../_components/memory-limit-card";
import { RequestTimeoutCard } from "../_components/request-timeout-card";
import { ShutdownTimeoutCard } from "../_components/shutdown-timeout-card";

export default function ServiceRuntimePage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="space-y-6">
      <HealthCheckCard serviceId={serviceId} projectId={projectId} />
      <RequestTimeoutCard serviceId={serviceId} projectId={projectId} />
      <ShutdownTimeoutCard serviceId={serviceId} projectId={projectId} />
      <MemoryLimitCard serviceId={serviceId} projectId={projectId} />
      <CpuLimitCard serviceId={serviceId} projectId={projectId} />
    </div>
  );
}
