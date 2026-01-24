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

export interface Migrations {
  id: Generated<number>;
  name: string;
  appliedAt: number;
}

export interface ApiKeys {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: Generated<string>;
  lastUsedAt: string | null;
}

export interface Deployments {
  id: string;
  serviceId: string;
  environmentId: string;
  commitSha: string;
  commitMessage: string | null;
  status: Generated<'pending' | 'cloning' | 'pulling' | 'building' | 'deploying' | 'running' | 'failed' | 'stopped' | 'cancelled'>;
  containerId: string | null;
  hostPort: number | null;
  buildLog: string | null;
  errorMessage: string | null;
  imageName: string | null;
  envVarsSnapshot: string | null;
  containerPort: number | null;
  healthCheckPath: string | null;
  healthCheckTimeout: number | null;
  volumes: string | null;
  rollbackEligible: Generated<boolean | null>;
  rollbackSourceId: string | null;
  gitCommitSha: string | null;
  gitBranch: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface Domains {
  id: string;
  serviceId: string;
  environmentId: string;
  domain: string;
  'type': Generated<'proxy' | 'redirect'>;
  redirectTarget: string | null;
  redirectCode: Generated<301 | 307 | null>;
  dnsVerified: Generated<boolean | null>;
  sslStatus: Generated<'pending' | 'active' | 'failed' | null>;
  isSystem: Generated<boolean | null>;
  createdAt: number;
}

export interface Environments {
  id: string;
  projectId: string;
  name: string;
  'type': Generated<'production' | 'preview' | 'manual'>;
  prNumber: number | null;
  prBranch: string | null;
  isEphemeral: Generated<boolean | null>;
  createdAt: number;
}

export interface GithubInstallations {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: Generated<'User' | 'Organization'>;
  createdAt: number;
}

export interface Metrics {
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

export interface Projects {
  id: string;
  name: string;
  hostname: string | null;
  envVars: Generated<string>;
  canvasPositions: Generated<string | null>;
  createdAt: number;
}

export interface Registries {
  id: string;
  name: string;
  'type': string;
  url: string | null;
  username: string;
  passwordEncrypted: string;
  createdAt: number;
}

export interface Services {
  id: string;
  environmentId: string;
  name: string;
  hostname: string | null;
  deployType: Generated<'repo' | 'image'>;
  serviceType: Generated<'app' | 'database'>;
  repoUrl: string | null;
  branch: Generated<string | null>;
  dockerfilePath: Generated<string | null>;
  buildContext: string | null;
  imageUrl: string | null;
  registryId: string | null;
  envVars: Generated<string>;
  containerPort: Generated<number | null>;
  healthCheckPath: string | null;
  healthCheckTimeout: Generated<number | null>;
  autoDeploy: Generated<boolean | null>;
  volumes: Generated<string | null>;
  tcpProxyPort: number | null;
  memoryLimit: string | null;
  cpuLimit: number | null;
  shutdownTimeout: number | null;
  requestTimeout: number | null;
  command: string | null;
  icon: string | null;
  currentDeploymentId: string | null;
  createdAt: number;
}

export interface Settings {
  key: string;
  value: string;
}

export interface DB {
  _Migrations: Migrations;
  apiKeys: ApiKeys;
  deployments: Deployments;
  domains: Domains;
  environments: Environments;
  githubInstallations: GithubInstallations;
  metrics: Metrics;
  projects: Projects;
  registries: Registries;
  services: Services;
  settings: Settings;
}
