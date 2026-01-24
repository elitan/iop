"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Service } from "@/lib/api";
import { ServiceContent } from "./service-content";

interface ServiceCardProps {
  service: Service;
  projectId: string;
  domain: string | null;
  serverIp: string | null;
}

export function ServiceCard({
  service,
  projectId,
  domain,
  serverIp,
}: ServiceCardProps) {
  const deployment = service.latestDeployment;
  const url =
    domain ||
    (serverIp && deployment?.hostPort
      ? `${serverIp}:${deployment.hostPort}`
      : null);

  return (
    <Link
      href={`/projects/${projectId}/services/${service.id}`}
      className="h-full"
    >
      <Card className="h-full cursor-pointer bg-neutral-900 border-neutral-800 transition-colors hover:border-neutral-700">
        <CardContent className="flex h-full flex-col p-4">
          <ServiceContent service={service} url={url} />
          <div className="flex-grow" />
        </CardContent>
      </Card>
    </Link>
  );
}
