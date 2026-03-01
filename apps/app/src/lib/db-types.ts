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

export interface DatabaseBackupConfigs {
  databaseId: string;
  enabled: Generated<boolean>;
  selectedTargetIdsJson: Generated<string>;
  intervalValue: Generated<number>;
  intervalUnit: Generated<'minutes' | 'hours' | 'days'>;
  retentionDays: Generated<number>;
  s3Provider: Generated<'aws' | 'cloudflare' | 'backblaze' | 'custom'>;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: Generated<string>;
  s3Prefix: Generated<string>;
  s3AccessKeyId: Generated<string>;
  s3SecretAccessKeyEncrypted: Generated<string>;
  s3ForcePathStyle: Generated<boolean>;
  includeGlobals: Generated<boolean>;
  running: Generated<boolean>;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DatabaseTargetDeployments {
  id: string;
  targetId: string;
  action: 'create' | 'deploy' | 'reset' | 'start' | 'stop';
  status: 'running' | 'failed' | 'stopped';
  message: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface DatabaseTargets {
  id: string;
  databaseId: string;
  name: string;
  kind: 'branch' | 'instance';
  sourceTargetId: string | null;
  lifecycleStatus: Generated<'active' | 'stopped' | 'expired'>;
  providerRefJson: Generated<string>;
  createdAt: number;
  runtimeServiceId: Generated<string>;
  hostname: Generated<string>;
  ttlValue: number | null;
  ttlUnit: 'hours' | 'days' | null;
  scaleToZeroMinutes: number | null;
  lastActivityAt: number | null;
  runtimeHostPort: number | null;
}

export interface Databases {
  id: string;
  projectId: string;
  name: string;
  engine: 'postgres' | 'mysql';
  provider: 'postgres-docker' | 'mysql-docker';
  createdAt: number;
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
  trigger: Generated<string | null>;
  triggeredByUsername: string | null;
  triggeredByAvatarUrl: string | null;
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

export interface EnvironmentDatabaseAttachments {
  id: string;
  environmentId: string;
  databaseId: string;
  targetId: string;
  mode: 'managed' | 'manual';
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
  prCommentId: number | null;
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

export interface OauthClients {
  id: string;
  clientId: string;
  clientName: string | null;
  redirectUris: Generated<string>;
  createdAt: Generated<string>;
}

export interface OauthCodes {
  id: string;
  codeHash: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: Generated<string>;
  redirectUri: string;
  resource: string | null;
  expiresAt: string;
  used: Generated<number>;
  createdAt: Generated<string>;
}

export interface OauthTokens {
  id: string;
  accessTokenHash: string;
  refreshTokenHash: string | null;
  clientId: string;
  scope: string | null;
  expiresAt: string;
  createdAt: Generated<string>;
}

export interface Projects {
  id: string;
  name: string;
  hostname: string | null;
  envVars: Generated<string>;
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

export interface Replicas {
  id: string;
  deploymentId: string;
  replicaIndex: number;
  containerId: string | null;
  hostPort: number | null;
  status: Generated<string>;
  createdAt: Generated<number>;
}

export interface ServiceDatabaseBindings {
  id: string;
  serviceId: string;
  databaseId: string;
  envVarKey: string;
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
  currentDeploymentId: string | null;
  createdAt: number;
  icon: string | null;
  frostFilePath: Generated<string | null>;
  drainTimeout: number | null;
  replicaCount: Generated<number>;
}

export interface Settings {
  key: string;
  value: string;
}

export interface DB {
  _Migrations: Migrations;
  apiKeys: ApiKeys;
  databaseBackupConfigs: DatabaseBackupConfigs;
  databaseTargetDeployments: DatabaseTargetDeployments;
  databaseTargets: DatabaseTargets;
  databases: Databases;
  deployments: Deployments;
  domains: Domains;
  environmentDatabaseAttachments: EnvironmentDatabaseAttachments;
  environments: Environments;
  githubInstallations: GithubInstallations;
  metrics: Metrics;
  oauthClients: OauthClients;
  oauthCodes: OauthCodes;
  oauthTokens: OauthTokens;
  projects: Projects;
  registries: Registries;
  replicas: Replicas;
  serviceDatabaseBindings: ServiceDatabaseBindings;
  services: Services;
  settings: Settings;
}
