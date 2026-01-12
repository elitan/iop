import { z } from "zod";

export const migrationSchema = z.object({
  id: z.number(),
  name: z.string(),
  appliedAt: z.number(),
});

export const newMigrationSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  appliedAt: z.number(),
});

export const migrationUpdateSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  appliedAt: z.number().optional(),
});

export type Migration = z.infer<typeof migrationSchema>;

export type NewMigration = z.infer<typeof newMigrationSchema>;

export type MigrationUpdate = z.infer<typeof migrationUpdateSchema>;

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  keyHash: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const newApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  keyHash: z.string(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable(),
});

export const apiKeyUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  keyPrefix: z.string().optional(),
  keyHash: z.string().optional(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullable().optional(),
});

export type ApiKey = z.infer<typeof apiKeySchema>;

export type NewApiKey = z.infer<typeof newApiKeySchema>;

export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

export const deploymentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  serviceId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string().nullable(),
  status: z.string(),
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
  rollbackEligible: z.number().nullable(),
  rollbackSourceId: z.string().nullable(),
});

export const newDeploymentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  serviceId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string().nullable(),
  status: z.string().optional(),
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
  rollbackEligible: z.number().nullable().optional(),
  rollbackSourceId: z.string().nullable(),
});

export const deploymentUpdateSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  serviceId: z.string().optional(),
  commitSha: z.string().optional(),
  commitMessage: z.string().nullable().optional(),
  status: z.string().optional(),
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
  rollbackEligible: z.number().nullable().optional(),
  rollbackSourceId: z.string().nullable().optional(),
});

export type Deployment = z.infer<typeof deploymentSchema>;

export type NewDeployment = z.infer<typeof newDeploymentSchema>;

export type DeploymentUpdate = z.infer<typeof deploymentUpdateSchema>;

export const domainSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  domain: z.string(),
  type: z.enum(["proxy", "redirect"]),
  redirectTarget: z.string().nullable(),
  redirectCode: z.union([z.literal(301), z.literal(307)]).nullable(),
  dnsVerified: z.coerce.boolean().nullable(),
  sslStatus: z.enum(["pending", "active", "failed"]).nullable(),
  createdAt: z.number(),
  isSystem: z.coerce.boolean().nullable(),
});

export const newDomainSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
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

export const domainUpdateSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string().optional(),
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

export type Domain = z.infer<typeof domainSchema>;

export type NewDomain = z.infer<typeof newDomainSchema>;

export type DomainUpdate = z.infer<typeof domainUpdateSchema>;

export const githubInstallationSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  createdAt: z.number(),
});

export const newGithubInstallationSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string().optional(),
  createdAt: z.number(),
});

export const githubInstallationUpdateSchema = z.object({
  id: z.string().optional(),
  installationId: z.string().optional(),
  accountLogin: z.string().optional(),
  accountType: z.string().optional(),
  createdAt: z.number().optional(),
});

export type GithubInstallation = z.infer<typeof githubInstallationSchema>;

export type NewGithubInstallation = z.infer<typeof newGithubInstallationSchema>;

export type GithubInstallationUpdate = z.infer<
  typeof githubInstallationUpdateSchema
>;

export const metricSchema = z.object({
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

export const newMetricSchema = z.object({
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

export const metricUpdateSchema = z.object({
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

export type Metric = z.infer<typeof metricSchema>;

export type NewMetric = z.infer<typeof newMetricSchema>;

export type MetricUpdate = z.infer<typeof metricUpdateSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  envVars: z.string(),
  createdAt: z.number(),
});

export const newProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  envVars: z.string().optional(),
  createdAt: z.number(),
});

export const projectUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  envVars: z.string().optional(),
  createdAt: z.number().optional(),
});

export type Project = z.infer<typeof projectSchema>;

export type NewProject = z.infer<typeof newProjectSchema>;

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const serviceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  deployType: z.string(),
  repoUrl: z.string().nullable(),
  branch: z.string().nullable(),
  dockerfilePath: z.string().nullable(),
  imageUrl: z.string().nullable(),
  envVars: z.string(),
  createdAt: z.number(),
  containerPort: z.number().nullable(),
  healthCheckPath: z.string().nullable(),
  healthCheckTimeout: z.number().nullable(),
  autoDeploy: z.number().nullable(),
  serviceType: z.string(),
  volumes: z.string().nullable(),
  tcpProxyPort: z.number().nullable(),
  currentDeploymentId: z.string().nullable(),
  memoryLimit: z.string().nullable(),
  cpuLimit: z.number().nullable(),
  shutdownTimeout: z.number().nullable(),
  requestTimeout: z.number().nullable(),
});

export const newServiceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  deployType: z.string().optional(),
  repoUrl: z.string().nullable(),
  branch: z.string().nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  imageUrl: z.string().nullable(),
  envVars: z.string().optional(),
  createdAt: z.number(),
  containerPort: z.number().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckTimeout: z.number().nullable().optional(),
  autoDeploy: z.number().nullable().optional(),
  serviceType: z.string().optional(),
  volumes: z.string().nullable().optional(),
  tcpProxyPort: z.number().nullable().optional(),
  currentDeploymentId: z.string().nullable(),
  memoryLimit: z.string().nullable().optional(),
  cpuLimit: z.number().nullable().optional(),
  shutdownTimeout: z.number().nullable().optional(),
  requestTimeout: z.number().nullable().optional(),
});

export const serviceUpdateSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().optional(),
  deployType: z.string().optional(),
  repoUrl: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  dockerfilePath: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  envVars: z.string().optional(),
  createdAt: z.number().optional(),
  containerPort: z.number().nullable().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckTimeout: z.number().nullable().optional(),
  autoDeploy: z.number().nullable().optional(),
  serviceType: z.string().optional(),
  volumes: z.string().nullable().optional(),
  tcpProxyPort: z.number().nullable().optional(),
  currentDeploymentId: z.string().nullable().optional(),
  memoryLimit: z.string().nullable().optional(),
  cpuLimit: z.number().nullable().optional(),
  shutdownTimeout: z.number().nullable().optional(),
  requestTimeout: z.number().nullable().optional(),
});

export type Service = z.infer<typeof serviceSchema>;

export type NewService = z.infer<typeof newServiceSchema>;

export type ServiceUpdate = z.infer<typeof serviceUpdateSchema>;

export const settingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const newSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const settingUpdateSchema = z.object({
  key: z.string().optional(),
  value: z.string().optional(),
});

export type Setting = z.infer<typeof settingSchema>;

export type NewSetting = z.infer<typeof newSettingSchema>;

export type SettingUpdate = z.infer<typeof settingUpdateSchema>;
