import type { Deployment, Service } from "@/lib/api";

const IN_PROGRESS_STATUSES = [
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
] as const;

export function getCurrentDeployment(
  service: Service | { currentDeploymentId: string | null },
  deployments: Deployment[],
): Deployment | null {
  if (service.currentDeploymentId) {
    return (
      deployments.find((d) => d.id === service.currentDeploymentId) ?? null
    );
  }
  return (
    deployments.find((d) =>
      (IN_PROGRESS_STATUSES as readonly string[]).includes(d.status),
    ) ?? null
  );
}
