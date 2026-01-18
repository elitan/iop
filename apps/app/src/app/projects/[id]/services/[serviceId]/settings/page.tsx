"use client";

import { useParams } from "next/navigation";
import { BuildConfigCard } from "./_components/build-config-card";
import { DangerZoneCard } from "./_components/danger-zone-card";
import { ImageConfigCard } from "./_components/image-config-card";
import { ServiceNameCard } from "./_components/service-name-card";

export default function ServiceSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="space-y-6">
      <ServiceNameCard serviceId={serviceId} projectId={projectId} />
      <BuildConfigCard serviceId={serviceId} projectId={projectId} />
      <ImageConfigCard serviceId={serviceId} projectId={projectId} />
      <DangerZoneCard serviceId={serviceId} projectId={projectId} />
    </div>
  );
}
