import { oc } from "@orpc/contract";
import { z } from "zod";
import { deploymentsSchema, servicesSchema } from "@/lib/db-schemas";
import {
  envVarSchema,
  serviceWithDeploymentSchema,
  volumeConfigSchema,
} from "./shared";

const volumeInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().nullable(),
});

export const servicesContract = {
  get: oc
    .route({ method: "GET", path: "/services/{id}" })
    .input(z.object({ id: z.string() }))
    .output(serviceWithDeploymentSchema),

  list: oc
    .route({ method: "GET", path: "/environments/{environmentId}/services" })
    .input(z.object({ environmentId: z.string() }))
    .output(z.array(serviceWithDeploymentSchema)),

  create: oc
    .route({ method: "POST", path: "/environments/{environmentId}/services" })
    .input(
      z.object({
        environmentId: z.string(),
        name: z.string().min(1),
        hostname: z
          .string()
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
          .optional(),
        deployType: z.enum(["repo", "image", "database"]).default("repo"),
        repoUrl: z.string().optional(),
        branch: z.string().default("main"),
        dockerfilePath: z.string().default("Dockerfile"),
        buildContext: z.string().optional(),
        imageUrl: z.string().optional(),
        envVars: z.array(envVarSchema).default([]),
        containerPort: z.number().min(1).max(65535).optional(),
        templateId: z.string().optional(),
        healthCheckPath: z.string().optional(),
        healthCheckTimeout: z.number().optional(),
        memoryLimit: z
          .string()
          .regex(/^\d+[kmg]$/i)
          .optional(),
        cpuLimit: z.number().min(0.1).max(64).optional(),
        shutdownTimeout: z.number().min(1).max(300).optional(),
        registryId: z.string().optional(),
      }),
    )
    .output(servicesSchema),

  update: oc
    .route({ method: "PATCH", path: "/services/{id}" })
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        hostname: z
          .string()
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
          .optional(),
        envVars: z.array(envVarSchema).optional(),
        containerPort: z.number().min(1).max(65535).optional(),
        branch: z.string().optional(),
        dockerfilePath: z.string().optional(),
        buildContext: z.string().nullable().optional(),
        repoUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        healthCheckPath: z.string().nullable().optional(),
        healthCheckTimeout: z.number().min(1).max(300).optional(),
        autoDeployEnabled: z.boolean().optional(),
        memoryLimit: z
          .string()
          .regex(/^\d+[kmg]$/i)
          .nullable()
          .optional(),
        cpuLimit: z.number().min(0.1).max(64).nullable().optional(),
        shutdownTimeout: z.number().min(1).max(300).nullable().optional(),
        requestTimeout: z.number().min(1).max(3600).nullable().optional(),
        volumes: z.array(volumeConfigSchema).optional(),
        registryId: z.string().nullable().optional(),
        command: z.string().nullable().optional(),
      }),
    )
    .output(servicesSchema),

  delete: oc
    .route({ method: "DELETE", path: "/services/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() })),

  deploy: oc
    .route({ method: "POST", path: "/services/{id}/deploy" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentId: z.string() })),

  listDeployments: oc
    .route({ method: "GET", path: "/services/{id}/deployments" })
    .input(z.object({ id: z.string() }))
    .output(z.array(deploymentsSchema)),

  getVolumes: oc
    .route({ method: "GET", path: "/services/{id}/volumes" })
    .input(z.object({ id: z.string() }))
    .output(z.array(volumeInfoSchema)),
};
