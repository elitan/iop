import { z } from "zod";

export const migrationsSchema = z.object({
  id: z.number(),
  name: z.string(),
  appliedAt: z.number(),
});

export const newMigrationsSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  appliedAt: z.number(),
});

export const migrationsUpdateSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  appliedAt: z.number().optional(),
});

export type Migrations = z.infer<typeof migrationsSchema>;

export type NewMigrations = z.infer<typeof newMigrationsSchema>;

export type MigrationsUpdate = z.infer<typeof migrationsUpdateSchema>;

export const apiKeysSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  keyHash: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const newApiKeysSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  keyHash: z.string(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable(),
});

export const apiKeysUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  keyPrefix: z.string().optional(),
  keyHash: z.string().optional(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable().optional(),
});

export type ApiKeys = z.infer<typeof apiKeysSchema>;

export type NewApiKeys = z.infer<typeof newApiKeysSchema>;

export type ApiKeysUpdate = z.infer<typeof apiKeysUpdateSchema>;

export const environmentTypeSchema = z.enum([
  "production",
  "preview",
  "manual",
]);

export const environmentsSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  type: environmentTypeSchema,
  prNumber: z.number().nullable(),
  prBranch: z.string().nullable(),
  isEphemeral: z.coerce.boolean().nullable(),
  createdAt: z.number(),
});

export const newEnvironmentsSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  type: environmentTypeSchema.optional(),
  prNumber: z.number().nullable(),
  prBranch: z.string().nullable(),
  isEphemeral: z.coerce.boolean().nullable().optional(),
  createdAt: z.number(),
});

export const environmentsUpdateSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().optional(),
  type: environmentTypeSchema.optional(),
  prNumber: z.number().nullable().optional(),
  prBranch: z.string().nullable().optional(),
  isEphemeral: z.coerce.boolean().nullable().optional(),
  createdAt: z.number().optional(),
});

export type Environments = z.infer<typeof environmentsSchema>;
export type NewEnvironments = z.infer<typeof newEnvironmentsSchema>;
export type EnvironmentsUpdate = z.infer<typeof environmentsUpdateSchema>;

export const deploymentStatusSchema = z.enum([
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
  "running",
  "failed",
  "stopped",
  "cancelled",
]);

export const deploymentsSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  environmentId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string().nullable(),
  status: deploymentStatusSchema,
  containerId: z.string().nullable(),
  hostPort: z.number().nullable(),
  buildLog: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
  imageName: z.string().nullable(),
  envVarsSnapshot: z.string().nullable(),
  containerPort: z.number().nullable(),
  healthCheckPath: z.string().nullable(),
  healthCheckTimeout: z.number().nullable(),
  volumes: z.string().nullable(),
  rollbackEligible: z.coerce.boolean().nullable(),
  rollbackSourceId: z.string().nullable(),
  gitCommitSha: z.string().nullable(),
  gitBranch: z.string().nullable(),
});

export const newDeploymentsSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  environmentId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string().nullable(),
  status: deploymentStatusSchema.optional(),
  containerId: z.string().nullable(),
  hostPort: z.number().nullable(),
  buildLog: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
  imageName: z.string().nullable(),
  envVarsSnapshot: z.string().nullable(),
  containerPort: z.number().nullable(),
  healthCheckPath: z.string().nullable(),
  healthCheckTimeout: z.number().nullable(),
  volumes: z.string().nullable(),
  rollbackEligible: z.coerce.boolean().nullable().optional(),
  rollbackSourceId: z.string().nullable(),
  gitCommitSha: z.string().nullable(),
  gitBranch: z.string().nullable(),
});

export const deploymentsUpdateSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string().optional(),
  environmentId: z.string().optional(),
  commitSha: z.string().optional(),
  commitMessage: z.string().nullable().optional(),
  status: deploymentStatusSchema.optional(),
  containerId: z.string().nullable().optional(),
  hostPort: z.number().nullable().optional(),
  buildLog: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.number().optional(),
  finishedAt: z.number().nullable().optional(),
  imageName: z.string().nullable().optional(),
  envVarsSnapshot: z.string().nullable().optional(),
  containerPort: z.number().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckTimeout: z.number().nullable().optional(),
  volumes: z.string().nullable().optional(),
  rollbackEligible: z.coerce.boolean().nullable().optional(),
  rollbackSourceId: z.string().nullable().optional(),
  gitCommitSha: z.string().nullable().optional(),
  gitBranch: z.string().nullable().optional(),
});

export type Deployments = z.infer<typeof deploymentsSchema>;

export type NewDeployments = z.infer<typeof newDeploymentsSchema>;

export type DeploymentsUpdate = z.infer<typeof deploymentsUpdateSchema>;

export const domainsSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  environmentId: z.string(),
  domain: z.string(),
  type: z.enum(["proxy", "redirect"]),
  redirectTarget: z.string().nullable(),
  redirectCode: z.union([z.literal(301), z.literal(307)]).nullable(),
  dnsVerified: z.coerce.boolean().nullable(),
  sslStatus: z.enum(["pending", "active", "failed"]).nullable(),
  createdAt: z.number(),
  isSystem: z.coerce.boolean().nullable(),
});

export const newDomainsSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  environmentId: z.string(),
  domain: z.string(),
  type: z.enum(["proxy", "redirect"]).optional(),
  redirectTarget: z.string().nullable(),
  redirectCode: z
    .union([z.literal(301), z.literal(307)])
    .nullable()
    .optional(),
  dnsVerified: z.coerce.boolean().nullable().optional(),
  sslStatus: z.enum(["pending", "active", "failed"]).nullable().optional(),
  createdAt: z.number(),
  isSystem: z.coerce.boolean().nullable().optional(),
});

export const domainsUpdateSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string().optional(),
  environmentId: z.string().optional(),
  domain: z.string().optional(),
  type: z.enum(["proxy", "redirect"]).optional(),
  redirectTarget: z.string().nullable().optional(),
  redirectCode: z
    .union([z.literal(301), z.literal(307)])
    .nullable()
    .optional(),
  dnsVerified: z.coerce.boolean().nullable().optional(),
  sslStatus: z.enum(["pending", "active", "failed"]).nullable().optional(),
  createdAt: z.number().optional(),
  isSystem: z.coerce.boolean().nullable().optional(),
});

export type Domains = z.infer<typeof domainsSchema>;

export type NewDomains = z.infer<typeof newDomainsSchema>;

export type DomainsUpdate = z.infer<typeof domainsUpdateSchema>;

export const githubInstallationsSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  createdAt: z.number(),
});

export const newGithubInstallationsSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string().optional(),
  createdAt: z.number(),
});

export const githubInstallationsUpdateSchema = z.object({
  id: z.string().optional(),
  installationId: z.string().optional(),
  accountLogin: z.string().optional(),
  accountType: z.string().optional(),
  createdAt: z.number().optional(),
});

export type GithubInstallations = z.infer<typeof githubInstallationsSchema>;

export type NewGithubInstallations = z.infer<
  typeof newGithubInstallationsSchema
>;

export type GithubInstallationsUpdate = z.infer<
  typeof githubInstallationsUpdateSchema
>;

export const metricsSchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  type: z.string(),
  containerId: z.string().nullable(),
  serviceId: z.string().nullable(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  memoryBytes: z.number().nullable(),
  networkRx: z.number().nullable(),
  networkTx: z.number().nullable(),
  diskPercent: z.number().nullable(),
  createdAt: z.string().nullable(),
});

export const newMetricsSchema = z.object({
  id: z.number().optional(),
  timestamp: z.number(),
  type: z.string(),
  containerId: z.string().nullable(),
  serviceId: z.string().nullable(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  memoryBytes: z.number().nullable(),
  networkRx: z.number().nullable(),
  networkTx: z.number().nullable(),
  diskPercent: z.number().nullable(),
  createdAt: z.string().nullable().optional(),
});

export const metricsUpdateSchema = z.object({
  id: z.number().optional(),
  timestamp: z.number().optional(),
  type: z.string().optional(),
  containerId: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  cpuPercent: z.number().optional(),
  memoryPercent: z.number().optional(),
  memoryBytes: z.number().nullable().optional(),
  networkRx: z.number().nullable().optional(),
  networkTx: z.number().nullable().optional(),
  diskPercent: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

export type Metrics = z.infer<typeof metricsSchema>;

export type NewMetrics = z.infer<typeof newMetricsSchema>;

export type MetricsUpdate = z.infer<typeof metricsUpdateSchema>;

export const projectsSchema = z.object({
  id: z.string(),
  name: z.string(),
  envVars: z.string(),
  createdAt: z.number(),
  hostname: z.string().nullable(),
  canvasPositions: z.string().nullable(),
});

export const newProjectsSchema = z.object({
  id: z.string(),
  name: z.string(),
  envVars: z.string().optional(),
  createdAt: z.number(),
  hostname: z.string().nullable(),
  canvasPositions: z.string().nullable().optional(),
});

export const projectsUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  envVars: z.string().optional(),
  createdAt: z.number().optional(),
  hostname: z.string().nullable().optional(),
  canvasPositions: z.string().nullable().optional(),
});

export type Projects = z.infer<typeof projectsSchema>;

export type NewProjects = z.infer<typeof newProjectsSchema>;

export type ProjectsUpdate = z.infer<typeof projectsUpdateSchema>;

export const registriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string().nullable(),
  username: z.string(),
  passwordEncrypted: z.string(),
  createdAt: z.number(),
});

export const newRegistriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string().nullable(),
  username: z.string(),
  passwordEncrypted: z.string(),
  createdAt: z.number(),
});

export const registriesUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  url: z.string().nullable().optional(),
  username: z.string().optional(),
  passwordEncrypted: z.string().optional(),
  createdAt: z.number().optional(),
});

export type Registries = z.infer<typeof registriesSchema>;

export type NewRegistries = z.infer<typeof newRegistriesSchema>;

export type RegistriesUpdate = z.infer<typeof registriesUpdateSchema>;

export const registryOutputSchema = registriesSchema.omit({
  passwordEncrypted: true,
});
export type RegistryOutput = z.infer<typeof registryOutputSchema>;

export const servicesSchema = z.object({
  id: z.string(),
  environmentId: z.string(),
  name: z.string(),
  deployType: z.string(),
  serviceType: z.string(),
  repoUrl: z.string().nullable(),
  branch: z.string().nullable(),
  dockerfilePath: z.string().nullable(),
  buildContext: z.string().nullable(),
  imageUrl: z.string().nullable(),
  registryId: z.string().nullable(),
  envVars: z.string(),
  containerPort: z.number().nullable(),
  healthCheckPath: z.string().nullable(),
  healthCheckTimeout: z.number().nullable(),
  autoDeploy: z.coerce.boolean().nullable(),
  volumes: z.string().nullable(),
  tcpProxyPort: z.number().nullable(),
  memoryLimit: z.string().nullable(),
  cpuLimit: z.number().nullable(),
  shutdownTimeout: z.number().nullable(),
  requestTimeout: z.number().nullable(),
  command: z.string().nullable(),
  icon: z.string().nullable(),
  hostname: z.string().nullable(),
  currentDeploymentId: z.string().nullable(),
  frostFilePath: z.string().nullable(),
  createdAt: z.number(),
});

export const newServicesSchema = z.object({
  id: z.string(),
  environmentId: z.string(),
  name: z.string(),
  deployType: z.string().optional(),
  serviceType: z.string().optional(),
  repoUrl: z.string().nullable(),
  branch: z.string().nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  buildContext: z.string().nullable(),
  imageUrl: z.string().nullable(),
  registryId: z.string().nullable(),
  envVars: z.string().optional(),
  containerPort: z.number().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckTimeout: z.number().nullable().optional(),
  autoDeploy: z.coerce.boolean().nullable().optional(),
  volumes: z.string().nullable().optional(),
  tcpProxyPort: z.number().nullable().optional(),
  memoryLimit: z.string().nullable(),
  cpuLimit: z.number().nullable(),
  shutdownTimeout: z.number().nullable(),
  requestTimeout: z.number().nullable(),
  command: z.string().nullable(),
  icon: z.string().nullable(),
  hostname: z.string().nullable(),
  currentDeploymentId: z.string().nullable(),
  frostFilePath: z.string().nullable().optional(),
  createdAt: z.number(),
});

export const servicesUpdateSchema = z.object({
  id: z.string().optional(),
  environmentId: z.string().optional(),
  name: z.string().optional(),
  deployType: z.string().optional(),
  serviceType: z.string().optional(),
  repoUrl: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  buildContext: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  registryId: z.string().nullable().optional(),
  envVars: z.string().optional(),
  containerPort: z.number().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckTimeout: z.number().nullable().optional(),
  autoDeploy: z.coerce.boolean().nullable().optional(),
  volumes: z.string().nullable().optional(),
  tcpProxyPort: z.number().nullable().optional(),
  memoryLimit: z.string().nullable().optional(),
  cpuLimit: z.number().nullable().optional(),
  shutdownTimeout: z.number().nullable().optional(),
  requestTimeout: z.number().nullable().optional(),
  command: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  currentDeploymentId: z.string().nullable().optional(),
  frostFilePath: z.string().nullable().optional(),
  createdAt: z.number().optional(),
});

export type Services = z.infer<typeof servicesSchema>;

export type NewServices = z.infer<typeof newServicesSchema>;

export type ServicesUpdate = z.infer<typeof servicesUpdateSchema>;

export const settingsSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const newSettingsSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const settingsUpdateSchema = z.object({
  key: z.string().optional(),
  value: z.string().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export type NewSettings = z.infer<typeof newSettingsSchema>;

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
