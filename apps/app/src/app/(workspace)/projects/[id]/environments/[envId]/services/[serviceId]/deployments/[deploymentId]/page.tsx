"use client";

import { useParams, useRouter } from "next/navigation";
import { ServiceDeploymentView } from "../../../../../../_components/service-deployment-view";

export default function ServiceDeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const serviceId = params.serviceId as string;
  const deploymentId = params.deploymentId as string;

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ServiceDeploymentView
        serviceId={serviceId}
        deploymentId={deploymentId}
        onBack={function onBack() {
          router.push(
            `/projects/${projectId}/environments/${envId}/services/${serviceId}`,
          );
        }}
      />
    </div>
  );
}
