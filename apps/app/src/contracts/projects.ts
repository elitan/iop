import { oc } from "@orpc/contract";
import { z } from "zod";
import { projectsSchema } from "@/lib/db-schemas";
import {
  envVarSchema,
  serviceAttentionStatusSchema,
  serviceRuntimeStatusSchema,
  serviceWithDeploymentSchema,
} from "./shared";

const latestDeploymentSchema = z.object({
  status: z.string(),
  commitMessage: z.string().nullable(),
  createdAt: z.number(),
  branch: z.string().nullable(),
});

const projectListServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  imageUrl: z.string().nullable(),
  deployType: z.string(),
  runtimeStatus: serviceRuntimeStatusSchema,
  attentionStatus: serviceAttentionStatusSchema,
});

const projectListItemSchema = projectsSchema.extend({
  servicesCount: z.number(),
  latestDeployment: latestDeploymentSchema.nullable(),
  repoUrl: z.string().nullable(),
  runningUrl: z.string().nullable(),
  services: z.array(projectListServiceSchema),
});

const projectWithServicesSchema = projectsSchema.extend({
  services: z.array(serviceWithDeploymentSchema),
});

export const projectsContract = {
  list: oc
    .route({ method: "GET", path: "/projects" })
    .output(z.array(projectListItemSchema)),

  get: oc
    .route({ method: "GET", path: "/projects/{projectId}" })
    .input(z.object({ projectId: z.string() }))
    .output(projectWithServicesSchema),

  create: oc
    .route({ method: "POST", path: "/projects" })
    .input(
      z.object({
        name: z.string().min(1),
        envVars: z.array(envVarSchema).default([]),
        templateId: z.string().optional(),
      }),
    )
    .output(projectsSchema),

  update: oc
    .route({ method: "PATCH", path: "/projects/{projectId}" })
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        envVars: z.array(envVarSchema).optional(),
      }),
    )
    .output(projectsSchema),

  delete: oc
    .route({ method: "DELETE", path: "/projects/{projectId}" })
    .input(z.object({ projectId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  deploy: oc
    .route({ method: "POST", path: "/projects/{projectId}/deploy" })
    .input(z.object({ projectId: z.string() }))
    .output(z.object({ deploymentIds: z.array(z.string()) })),
};
