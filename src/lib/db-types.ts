import type { ColumnType } from 'kysely';

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type ArrayType<T> = ArrayTypeImpl<T> extends (infer U)[]
  ? U[]
  : ArrayTypeImpl<T>;

export type ArrayTypeImpl<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S[], I[], U[]>
  : T[];

export type JsonPrimitive = string | number | boolean | null;

export type JsonArray = JsonValue[];

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface Migration {
  id: Generated<number>;
  name: string;
  appliedAt: number;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: Generated<string>;
  lastUsedAt: string | null;
}

export interface Deployment {
  id: string;
  projectId: string;
  serviceId: string;
  commitSha: string;
  commitMessage: string | null;
  status: Generated<string>;
  containerId: string | null;
  hostPort: number | null;
  buildLog: string | null;
  errorMessage: string | null;
  createdAt: number;
  finishedAt: number | null;
  imageName: string | null;
  envVarsSnapshot: string | null;
  containerPort: number | null;
  healthCheckPath: string | null;
  healthCheckTimeout: number | null;
  volumes: string | null;
  rollbackEligible: Generated<number | null>;
  rollbackSourceId: string | null;
  gitCommitSha: string | null;
  gitBranch: string | null;
}

export interface Domain {
  id: string;
  serviceId: string;
  domain: string;
  'type': Generated<'proxy' | 'redirect'>;
  redirectTarget: string | null;
  redirectCode: Generated<301 | 307 | null>;
  dnsVerified: Generated<boolean | null>;
  sslStatus: Generated<'pending' | 'active' | 'failed' | null>;
  createdAt: number;
  isSystem: Generated<boolean | null>;
}

export interface GithubInstallation {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: Generated<string>;
  createdAt: number;
}

export interface Metric {
  id: Generated<number>;
  timestamp: number;
  'type': string;
  containerId: string | null;
  serviceId: string | null;
  cpuPercent: number;
  memoryPercent: number;
  memoryBytes: number | null;
  networkRx: number | null;
  networkTx: number | null;
  diskPercent: number | null;
  createdAt: Generated<string | null>;
}

export interface Project {
  id: string;
  name: string;
  envVars: Generated<string>;
  createdAt: number;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  deployType: Generated<string>;
  repoUrl: string | null;
  branch: Generated<string | null>;
  dockerfilePath: Generated<string | null>;
  imageUrl: string | null;
  envVars: Generated<string>;
  createdAt: number;
  containerPort: Generated<number | null>;
  healthCheckPath: Generated<string | null>;
  healthCheckTimeout: Generated<number | null>;
  autoDeploy: Generated<number | null>;
  serviceType: Generated<string>;
  volumes: Generated<string | null>;
  tcpProxyPort: Generated<number | null>;
  currentDeploymentId: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface DB {
  _Migrations: Migration;
  apiKeys: ApiKey;
  deployments: Deployment;
  domains: Domain;
  githubInstallations: GithubInstallation;
  metrics: Metric;
  projects: Project;
  services: Service;
  settings: Setting;
}
