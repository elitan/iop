"use client";

import { SettingCard } from "@/components/setting-card";
import { useService } from "@/hooks/use-services";

interface ConfigurationCardProps {
  serviceId: string;
}

export function ConfigurationCard({ serviceId }: ConfigurationCardProps) {
  const { data: service } = useService(serviceId);

  if (!service) return null;

  return (
    <SettingCard
      title="Configuration"
      description="Deployment configuration for this service."
    >
      <dl className="grid grid-cols-3 gap-4 text-sm">
        {service.deployType === "repo" ? (
          <>
            <div>
              <dt className="text-neutral-500">Branch</dt>
              <dd className="mt-1 font-mono text-neutral-300">
                {service.branch}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Dockerfile</dt>
              <dd className="mt-1 font-mono text-neutral-300">
                {service.dockerfilePath}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-neutral-500">Image</dt>
            <dd className="mt-1 font-mono text-neutral-300">
              {service.imageUrl}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-neutral-500">Container Port</dt>
          <dd className="mt-1 font-mono text-neutral-300">
            {service.containerPort ?? 8080}
          </dd>
        </div>
      </dl>
    </SettingCard>
  );
}
