import type { ContractInputs, ContractOutputs } from "@/contracts";

export type Project = ContractOutputs["projects"]["get"];
export type ProjectListItem = ContractOutputs["projects"]["list"][number];
export type Service = ContractOutputs["services"]["get"];
export type Deployment = ContractOutputs["deployments"]["get"];
export type Replica = ContractOutputs["deployments"]["getReplicas"][number];
export type Domain = ContractOutputs["domains"]["get"];

export type ProjectLatestDeployment = NonNullable<
  ProjectListItem["latestDeployment"]
>;

export type CreateProjectInput = ContractInputs["projects"]["create"];
export type CreateServiceInput = Omit<
  ContractInputs["services"]["create"],
  "environmentId"
>;

export interface EnvVar {
  key: string;
  value: string;
}

export interface ServiceDefinition {
  image: string;
  port: number;
  main?: boolean;
  type?: "database" | "app";
  command?: string;
  environment?: Record<string, unknown>;
  volumes?: string[];
  health_check?: {
    path?: string;
    timeout: number;
  };
  ssl?: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  docs?: string;
  type: "database" | "service" | "project";
  services: Record<string, ServiceDefinition>;
}

export type DatabaseTemplate = Template;

export interface TcpProxyStatus {
  enabled: boolean;
  port: number | null;
  hostPort: number | null;
}

export interface ContainerStats {
  containerId: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  serviceId: string | null;
}

export interface SystemStats {
  cpuPercent: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  diskUsed: number;
  diskTotal: number;
  diskPercent: number;
}

export interface MonitoringSnapshot {
  timestamp: number;
  system: SystemStats;
  containers: ContainerStats[];
}

export interface MetricsHistoryPoint {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryBytes?: number;
  diskPercent?: number;
  containerId?: string;
  serviceId?: string;
}

export interface MetricsHistory {
  system: MetricsHistoryPoint[];
  containers: Record<string, MetricsHistoryPoint[]>;
}

export interface VolumeConfig {
  name: string;
  path: string;
}

export interface VolumeInfo {
  name: string;
  path: string;
  sizeBytes: number | null;
}

export interface HostResources {
  cpus: number;
  totalMemoryGB: number;
}

export interface Settings {
  domain: string | null;
  email: string | null;
  sslEnabled: string | null;
  serverIp: string | null;
  demoMode: boolean;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.error || "Request failed");
  }
  return res.json();
}

export const api = {
  settings: {
    get: (): Promise<Settings> =>
      fetch("/api/settings").then((r) => handleResponse<Settings>(r)),
  },

  health: {
    hostResources: (): Promise<HostResources> =>
      fetch("/api/host-resources").then((r) =>
        handleResponse<HostResources>(r),
      ),
  },

  dbTemplates: {
    list: (): Promise<DatabaseTemplate[]> =>
      fetch("/api/db-templates").then((r) =>
        handleResponse<DatabaseTemplate[]>(r),
      ),
  },

  serviceTemplates: {
    list: (): Promise<Template[]> =>
      fetch("/api/templates/services").then((r) =>
        handleResponse<Template[]>(r),
      ),
  },

  tcpProxy: {
    get: (serviceId: string): Promise<TcpProxyStatus> =>
      fetch(`/api/services/${serviceId}/tcp-proxy`).then((r) =>
        handleResponse<TcpProxyStatus>(r),
      ),

    enable: (serviceId: string): Promise<TcpProxyStatus> =>
      fetch(`/api/services/${serviceId}/tcp-proxy`, { method: "POST" }).then(
        (r) => handleResponse<TcpProxyStatus>(r),
      ),

    disable: (serviceId: string): Promise<TcpProxyStatus> =>
      fetch(`/api/services/${serviceId}/tcp-proxy`, { method: "DELETE" }).then(
        (r) => handleResponse<TcpProxyStatus>(r),
      ),
  },

  monitoring: {
    getStats: (): Promise<MonitoringSnapshot> =>
      fetch("/api/monitoring/stats").then((r) =>
        handleResponse<MonitoringSnapshot>(r),
      ),

    getHistory: (range: string, type?: string): Promise<MetricsHistory> =>
      fetch(
        `/api/monitoring/history?range=${range}${type ? `&type=${type}` : ""}`,
      ).then((r) => handleResponse<MetricsHistory>(r)),

    getServiceHistory: (
      serviceId: string,
      range: string,
    ): Promise<MetricsHistory> =>
      fetch(
        `/api/monitoring/history?range=${range}&serviceId=${serviceId}`,
      ).then((r) => handleResponse<MetricsHistory>(r)),
  },
};
