"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useService } from "@/hooks/use-services";
import { api } from "@/lib/api";
import { DomainsSection } from "../../_components/domains-section";

export default function ServiceDomainsPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;

  const { data: service } = useService(serviceId);
  const [serverIp, setServerIp] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
  }, []);

  if (!service) return null;

  return (
    <DomainsSection
      serviceId={serviceId}
      hasRunningDeployment={!!service.currentDeploymentId}
      serverIp={serverIp}
    />
  );
}
