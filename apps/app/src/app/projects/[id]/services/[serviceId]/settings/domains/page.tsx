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
  const [wildcardConfigured, setWildcardConfigured] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => setServerIp(s.serverIp));
    fetch("/api/settings/wildcard")
      .then((res) => res.json())
      .then((data) => setWildcardConfigured(data.configured))
      .catch(() => {});
  }, []);

  if (!service) return null;

  return (
    <DomainsSection
      serviceId={serviceId}
      hasRunningDeployment={!!service.currentDeploymentId}
      serverIp={serverIp}
      wildcardConfigured={wildcardConfigured}
    />
  );
}
