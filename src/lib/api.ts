export interface ProjectLatestDeployment {
  status: string;
  commitMessage: string | null;
  createdAt: number;
  branch: string | null;
}

export interface Project {
  id: string;
  name: string;
  envVars: string;
  createdAt: number;
  services?: Service[];
  servicesCount?: number;
  latestDeployment?: ProjectLatestDeployment | null;
  repoUrl?: string | null;
  runningUrl?: string | null;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  deployType: "repo" | "image";
  repoUrl: string | null;
  branch: string | null;
  dockerfilePath: string | null;
  imageUrl: string | null;
  envVars: string;
  containerPort: number | null;
  healthCheckPath: string | null;
  healthCheckTimeout: number | null;
  createdAt: number;
  serviceType: "app" | "database";
  volumes: string | null;
  tcpProxyPort: number | null;
  currentDeploymentId: string | null;
  latestDeployment?: Deployment;
}

export interface Deployment {
  id: string;
  projectId: string;
  serviceId: string;
  commitSha: string;
  commitMessage: string | null;
  status: string;
  hostPort: number | null;
  createdAt: number;
  finishedAt: number | null;
  buildLog: string | null;
  errorMessage: string | null;
  imageName: string | null;
  envVarsSnapshot: string | null;
  containerPort: number | null;
  healthCheckPath: string | null;
  healthCheckTimeout: number | null;
  volumes: string | null;
  rollbackEligible: number | null;
  rollbackSourceId: string | null;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface Domain {
  id: string;
  serviceId: string;
  domain: string;
  type: "proxy" | "redirect";
  redirectTarget: string | null;
  redirectCode: number | null;
  dnsVerified: number;
  sslStatus: "pending" | "active" | "failed";
  isSystem: number;
  createdAt: number;
}

export interface AddDomainInput {
  domain: string;
  type?: "proxy" | "redirect";
  redirectTarget?: string;
  redirectCode?: 301 | 307;
}

export interface UpdateDomainInput {
  type?: "proxy" | "redirect";
  redirectTarget?: string;
  redirectCode?: 301 | 307;
}

export interface DnsStatus {
  valid: boolean;
  serverIp: string;
  domainIp: string | null;
  dnsVerified: boolean;
}

export interface SslStatus {
  working: boolean;
  status: "pending" | "active" | "failed";
  error?: string;
}

export interface Settings {
  domain: string | null;
  email: string | null;
  sslEnabled: string | null;
  serverIp: string | null;
}

export interface CreateProjectInput {
  name: string;
  env_vars?: EnvVar[];
}

export interface UpdateProjectInput {
  name?: string;
  env_vars?: EnvVar[];
}

export interface CreateServiceInput {
  name: string;
  deployType: "repo" | "image" | "database";
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  imageUrl?: string;
  envVars?: EnvVar[];
  containerPort?: number;
  templateId?: string;
}

export interface DatabaseTemplate {
  id: string;
  name: string;
  image: string;
  containerPort: number;
  envVars: { key: string; value: string; generated?: boolean }[];
  volumes: { name: string; path: string }[];
  healthCheckTimeout: number;
}

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

export interface UpdateServiceInput {
  name?: string;
  env_vars?: EnvVar[];
  branch?: string;
  dockerfile_path?: string;
  repo_url?: string;
  image_url?: string;
  container_port?: number;
  health_check_path?: string | null;
  health_check_timeout?: number;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

export const api = {
  projects: {
    list: (): Promise<Project[]> =>
      fetch("/api/projects").then((r) => handleResponse<Project[]>(r)),

    get: (id: string): Promise<Project> =>
      fetch(`/api/projects/${id}`).then((r) => handleResponse<Project>(r)),

    create: (data: CreateProjectInput): Promise<Project> =>
      fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Project>(r)),

    update: (id: string, data: UpdateProjectInput): Promise<Project> =>
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Project>(r)),

    delete: (id: string): Promise<{ success: boolean }> =>
      fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) =>
        handleResponse<{ success: boolean }>(r),
      ),

    deploy: (id: string): Promise<{ deployment_ids: string[] }> =>
      fetch(`/api/projects/${id}/deploy`, { method: "POST" }).then((r) =>
        handleResponse<{ deployment_ids: string[] }>(r),
      ),
  },

  services: {
    list: (projectId: string): Promise<Service[]> =>
      fetch(`/api/projects/${projectId}/services`).then((r) =>
        handleResponse<Service[]>(r),
      ),

    get: (id: string): Promise<Service> =>
      fetch(`/api/services/${id}`).then((r) => handleResponse<Service>(r)),

    create: (projectId: string, data: CreateServiceInput): Promise<Service> =>
      fetch(`/api/projects/${projectId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Service>(r)),

    update: (id: string, data: UpdateServiceInput): Promise<Service> =>
      fetch(`/api/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Service>(r)),

    delete: (id: string): Promise<{ success: boolean }> =>
      fetch(`/api/services/${id}`, { method: "DELETE" }).then((r) =>
        handleResponse<{ success: boolean }>(r),
      ),

    deploy: (id: string): Promise<{ deployment_id: string }> =>
      fetch(`/api/services/${id}/deploy`, { method: "POST" }).then((r) =>
        handleResponse<{ deployment_id: string }>(r),
      ),
  },

  deployments: {
    get: (id: string): Promise<Deployment> =>
      fetch(`/api/deployments/${id}`).then((r) =>
        handleResponse<Deployment>(r),
      ),

    listByService: (serviceId: string): Promise<Deployment[]> =>
      fetch(`/api/services/${serviceId}/deployments`).then((r) =>
        handleResponse<Deployment[]>(r),
      ),

    rollback: (id: string): Promise<{ deployment_id: string }> =>
      fetch(`/api/deployments/${id}/rollback`, { method: "POST" }).then((r) =>
        handleResponse<{ deployment_id: string }>(r),
      ),
  },

  domains: {
    list: (serviceId: string): Promise<Domain[]> =>
      fetch(`/api/services/${serviceId}/domains`).then((r) =>
        handleResponse<Domain[]>(r),
      ),

    get: (id: string): Promise<Domain> =>
      fetch(`/api/domains/${id}`).then((r) => handleResponse<Domain>(r)),

    add: (serviceId: string, data: AddDomainInput): Promise<Domain> =>
      fetch(`/api/services/${serviceId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Domain>(r)),

    update: (id: string, data: UpdateDomainInput): Promise<Domain> =>
      fetch(`/api/domains/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => handleResponse<Domain>(r)),

    delete: (id: string): Promise<{ success: boolean }> =>
      fetch(`/api/domains/${id}`, { method: "DELETE" }).then((r) =>
        handleResponse<{ success: boolean }>(r),
      ),

    verifyDns: (id: string): Promise<DnsStatus> =>
      fetch(`/api/domains/${id}/verify-dns`, { method: "POST" }).then((r) =>
        handleResponse<DnsStatus>(r),
      ),

    verifySsl: (id: string): Promise<SslStatus> =>
      fetch(`/api/domains/${id}/verify-ssl`, { method: "POST" }).then((r) =>
        handleResponse<SslStatus>(r),
      ),
  },

  settings: {
    get: (): Promise<Settings> =>
      fetch("/api/settings").then((r) => handleResponse<Settings>(r)),
  },

  dbTemplates: {
    list: (): Promise<DatabaseTemplate[]> =>
      fetch("/api/db-templates").then((r) =>
        handleResponse<DatabaseTemplate[]>(r),
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
