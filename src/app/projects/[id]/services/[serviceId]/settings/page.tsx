"use client";

import { useParams } from "next/navigation";
import { ConfigurationCard } from "./_components/configuration-card";
import { DangerZoneCard } from "./_components/danger-zone-card";

export default function ServiceSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="space-y-6">
      <ConfigurationCard serviceId={serviceId} />
      <DangerZoneCard serviceId={serviceId} projectId={projectId} />
    </div>
  );
}
