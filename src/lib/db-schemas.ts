// Zod schemas for database tables
// TODO: Replace with auto-generated schemas from kysely-gen once --zod flag is implemented
// See: https://github.com/elitan/kysely-gen/issues/28

import { z } from "zod";

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  envVars: z.string(),
  createdAt: z.number(),
});

export const deploymentSchema = z
  .object({
    id: z.string(),
    serviceId: z.string(),
    projectId: z.string(),
    status: z.string(),
    commitSha: z.string().nullable(),
    commitMessage: z.string().nullable(),
    containerId: z.string().nullable(),
    hostPort: z.number().nullable(),
    buildLog: z.string().nullable(),
    createdAt: z.number(),
    imageName: z.string().nullable(),
    rollbackEligible: z.number().nullable(),
  })
  .passthrough();

export const serviceSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    deployType: z.string(),
    serviceType: z.string(),
    repoUrl: z.string().nullable(),
    branch: z.string().nullable(),
    dockerfilePath: z.string().nullable(),
    imageUrl: z.string().nullable(),
    envVars: z.string(),
    containerPort: z.number().nullable(),
    autoDeploy: z.number(),
    createdAt: z.number(),
    templateId: z.string().nullable(),
    healthCheckPath: z.string().nullable(),
    healthCheckTimeout: z.number().nullable(),
    currentDeploymentId: z.string().nullable(),
    volumes: z.string().nullable(),
  })
  .passthrough();

export const domainSchema = z
  .object({
    id: z.string(),
    serviceId: z.string(),
    domain: z.string(),
    type: z.string(),
    redirectTarget: z.string().nullable(),
    redirectCode: z.number().nullable(),
    dnsVerified: z.number().nullable(),
    sslStatus: z.string().nullable(),
    isSystem: z.number().nullable(),
    createdAt: z.number(),
  })
  .passthrough();

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
