"use client";

import { useParams, useRouter } from "next/navigation";
import { ServiceSidebar } from "../../../../_components/service-sidebar";

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const serviceId = params.serviceId as string;

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ServiceSidebar
        projectId={projectId}
        serviceId={serviceId}
        onClose={function onClose() {
          router.push(`/projects/${projectId}/environments/${envId}`);
        }}
        onOpenDeploymentPage={function onOpenDeploymentPage(deploymentId) {
          router.push(
            `/projects/${projectId}/environments/${envId}/services/${serviceId}/deployments/${deploymentId}`,
          );
        }}
      />
    </div>
  );
}
