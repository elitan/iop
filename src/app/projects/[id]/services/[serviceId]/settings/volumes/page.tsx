"use client";

import { useParams } from "next/navigation";
import { VolumesCard } from "../_components/volumes-card";

export default function ServiceStoragePage() {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="space-y-6">
      <VolumesCard serviceId={serviceId} projectId={projectId} />
    </div>
  );
}
