import type {
  ServiceAttentionStatus,
  ServiceRuntimeStatus,
} from "./service-runtime-status";

interface ProjectResourceItem {
  runtimeStatus: ServiceRuntimeStatus;
  attentionStatus: ServiceAttentionStatus;
}

export interface ProjectResourceSummary {
  serviceCount: number;
  databaseCount: number;
  objectStorageCount: number;
  totalCount: number;
  onlineCount: number;
  attentionCount: number;
}

export type ProjectResourceSummaryTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

function countOnline(resources: ProjectResourceItem[]): number {
  return resources.filter(function isOnline(resource) {
    return resource.runtimeStatus === "online";
  }).length;
}

function countAttention(resources: ProjectResourceItem[]): number {
  return resources.filter(function hasAttention(resource) {
    return resource.attentionStatus !== null;
  }).length;
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

export function getProjectResourceSummary(input: {
  services: ProjectResourceItem[];
  databases: ProjectResourceItem[];
  objectStorages?: ProjectResourceItem[];
}): ProjectResourceSummary {
  const serviceCount = input.services.length;
  const databaseCount = input.databases.length;
  const objectStorageCount = input.objectStorages?.length ?? 0;

  return {
    serviceCount,
    databaseCount,
    objectStorageCount,
    totalCount: serviceCount + databaseCount + objectStorageCount,
    onlineCount:
      countOnline(input.services) +
      countOnline(input.databases) +
      countOnline(input.objectStorages ?? []),
    attentionCount:
      countAttention(input.services) +
      countAttention(input.databases) +
      countAttention(input.objectStorages ?? []),
  };
}

export function getProjectResourceSummaryTone(
  summary: ProjectResourceSummary,
): ProjectResourceSummaryTone {
  if (summary.totalCount === 0) {
    return "neutral";
  }

  if (
    summary.onlineCount === summary.totalCount &&
    summary.attentionCount === 0
  ) {
    return "success";
  }

  if (summary.onlineCount === 0) {
    return "danger";
  }

  return "warning";
}

export function formatProjectResourceBreakdown(
  summary: ProjectResourceSummary,
): string {
  if (summary.totalCount === 0) {
    return "0 resources";
  }

  const parts: string[] = [];

  if (summary.serviceCount > 0) {
    parts.push(formatCount(summary.serviceCount, "service"));
  }

  if (summary.databaseCount > 0) {
    parts.push(formatCount(summary.databaseCount, "database"));
  }

  if (summary.objectStorageCount > 0) {
    parts.push(formatCount(summary.objectStorageCount, "object storage"));
  }

  return parts.join(", ");
}
