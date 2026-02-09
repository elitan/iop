import type { Deployment, Service } from "@/lib/api";

const IN_PROGRESS_STATUSES = [
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
] as const;
const ACTIVE_STATUSES = [...IN_PROGRESS_STATUSES, "running"] as const;

export function getCurrentDeployment(
  service: Service | { currentDeploymentId: string | null },
  deployments: Deployment[],
): Deployment | null {
  if (service.currentDeploymentId) {
    const deployment =
      deployments.find((d) => d.id === service.currentDeploymentId) ?? null;
    if (!deployment) {
      return null;
    }
    return (ACTIVE_STATUSES as readonly string[]).includes(deployment.status)
      ? deployment
      : null;
  }
  return (
    deployments.find((d) =>
      (ACTIVE_STATUSES as readonly string[]).includes(d.status),
    ) ?? null
  );
}
