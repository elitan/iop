import { oc } from "@orpc/contract";
import { z } from "zod";

const databaseEngineSchema = z.enum(["postgres", "mysql"]);
const databaseProviderSchema = z.enum(["postgres-docker", "mysql-docker"]);
const databaseTargetKindSchema = z.enum(["branch", "instance"]);
const databaseTargetLifecycleSchema = z.enum(["active", "stopped", "expired"]);
const attachmentModeSchema = z.enum(["managed", "manual"]);
const databaseStorageBackendSchema = z.enum(["apfs", "zfs"]);

export const databaseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  engine: databaseEngineSchema,
  provider: databaseProviderSchema,
  createdAt: z.number(),
});

export const databaseTargetSchema = z.object({
  id: z.string(),
  databaseId: z.string(),
  name: z.string(),
  hostname: z.string(),
  kind: databaseTargetKindSchema,
  sourceTargetId: z.string().nullable(),
  runtimeServiceId: z.string(),
  lifecycleStatus: databaseTargetLifecycleSchema,
  providerRefJson: z.string(),
  createdAt: z.number(),
});

const databaseTargetDeploymentActionSchema = z.enum([
  "create",
  "deploy",
  "reset",
  "start",
  "stop",
]);

const databaseTargetDeploymentStatusSchema = z.enum([
  "running",
  "failed",
  "stopped",
]);

const databaseTargetDeploymentSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  action: databaseTargetDeploymentActionSchema,
  status: databaseTargetDeploymentStatusSchema,
  message: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
});

const databaseTargetRuntimeSchema = z.object({
  targetId: z.string(),
  name: z.string(),
  hostname: z.string(),
  runtimeServiceId: z.string(),
  lifecycleStatus: databaseTargetLifecycleSchema,
  containerName: z.string(),
  hostPort: z.number(),
  image: z.string(),
  port: z.number(),
  storageBackend: databaseStorageBackendSchema.nullable(),
  memoryLimit: z.string().nullable(),
  cpuLimit: z.number().nullable(),
  createdAt: z.number(),
});

const databaseTargetSqlResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  rowCount: z.number(),
  command: z.string().nullable(),
  output: z.string(),
  executedAt: z.number(),
});

const databaseWithMainTargetSchema = z.object({
  database: databaseSchema,
  target: databaseTargetSchema,
});

const environmentAttachmentSchema = z.object({
  id: z.string(),
  environmentId: z.string(),
  databaseId: z.string(),
  targetId: z.string(),
  mode: attachmentModeSchema,
  createdAt: z.number(),
  databaseName: z.string(),
  databaseEngine: databaseEngineSchema,
  targetName: z.string(),
  targetLifecycleStatus: databaseTargetLifecycleSchema,
});

const databaseAttachmentSchema = z.object({
  id: z.string(),
  environmentId: z.string(),
  databaseId: z.string(),
  targetId: z.string(),
  mode: attachmentModeSchema,
  createdAt: z.number(),
  environmentName: z.string(),
  environmentType: z.enum(["production", "preview", "manual"]),
  targetName: z.string(),
});

const serviceBindingSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  databaseId: z.string(),
  envVarKey: z.string(),
  createdAt: z.number(),
  databaseName: z.string(),
  databaseEngine: databaseEngineSchema,
});

export const databasesContract = {
  create: oc
    .route({ method: "POST", path: "/projects/{projectId}/databases" })
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        engine: databaseEngineSchema,
      }),
    )
    .output(databaseWithMainTargetSchema),

  list: oc
    .route({ method: "GET", path: "/projects/{projectId}/databases" })
    .input(z.object({ projectId: z.string() }))
    .output(z.array(databaseSchema)),

  get: oc
    .route({ method: "GET", path: "/databases/{databaseId}" })
    .input(z.object({ databaseId: z.string() }))
    .output(databaseSchema),

  delete: oc
    .route({ method: "DELETE", path: "/databases/{databaseId}" })
    .input(z.object({ databaseId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  createTarget: oc
    .route({ method: "POST", path: "/databases/{databaseId}/targets" })
    .input(
      z.object({
        databaseId: z.string(),
        name: z.string().min(1),
        sourceTargetName: z.string().optional(),
      }),
    )
    .output(databaseTargetSchema),

  listTargets: oc
    .route({ method: "GET", path: "/databases/{databaseId}/targets" })
    .input(z.object({ databaseId: z.string() }))
    .output(z.array(databaseTargetSchema)),

  listTargetDeployments: oc
    .route({
      method: "GET",
      path: "/database-targets/{targetId}/deployments",
    })
    .input(z.object({ targetId: z.string() }))
    .output(z.array(databaseTargetDeploymentSchema)),

  deployTarget: oc
    .route({ method: "POST", path: "/database-targets/{targetId}/deploy" })
    .input(z.object({ targetId: z.string() }))
    .output(databaseTargetDeploymentSchema),

  getTargetRuntime: oc
    .route({ method: "GET", path: "/database-targets/{targetId}/runtime" })
    .input(z.object({ targetId: z.string() }))
    .output(databaseTargetRuntimeSchema),

  runTargetSql: oc
    .route({ method: "POST", path: "/database-targets/{targetId}/sql" })
    .input(
      z.object({
        targetId: z.string(),
        sql: z.string().min(1),
      }),
    )
    .output(databaseTargetSqlResultSchema),

  patchTargetRuntimeSettings: oc
    .route({
      method: "PATCH",
      path: "/database-targets/{targetId}/runtime-settings",
    })
    .input(
      z.object({
        targetId: z.string(),
        name: z.string().min(1).optional(),
        hostname: z
          .string()
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
          .optional(),
        lifecycleStatus: z.enum(["active", "stopped"]).optional(),
        memoryLimit: z
          .string()
          .regex(/^\d+[kmg]$/i)
          .nullable()
          .optional(),
        cpuLimit: z.number().min(0.1).max(64).nullable().optional(),
      }),
    )
    .output(databaseTargetRuntimeSchema),

  resetTarget: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/targets/{targetId}/reset",
    })
    .input(
      z.object({
        databaseId: z.string(),
        targetId: z.string(),
        sourceTargetName: z.string(),
      }),
    )
    .output(databaseTargetSchema),

  startTarget: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/targets/{targetId}/start",
    })
    .input(z.object({ databaseId: z.string(), targetId: z.string() }))
    .output(databaseTargetSchema),

  stopTarget: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/targets/{targetId}/stop",
    })
    .input(z.object({ databaseId: z.string(), targetId: z.string() }))
    .output(databaseTargetSchema),

  deleteTarget: oc
    .route({
      method: "DELETE",
      path: "/databases/{databaseId}/targets/{targetId}",
    })
    .input(z.object({ databaseId: z.string(), targetId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  deleteTargetById: oc
    .route({
      method: "DELETE",
      path: "/database-targets/{targetId}",
    })
    .input(z.object({ targetId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  putAttachment: oc
    .route({
      method: "PUT",
      path: "/environments/{envId}/databases/{databaseId}/attachment",
    })
    .input(
      z.object({
        envId: z.string(),
        databaseId: z.string(),
        targetId: z.string(),
        mode: attachmentModeSchema,
      }),
    )
    .output(z.object({ success: z.boolean() })),

  listEnvironmentAttachments: oc
    .route({
      method: "GET",
      path: "/environments/{envId}/database-attachments",
    })
    .input(z.object({ envId: z.string() }))
    .output(z.array(environmentAttachmentSchema)),

  deleteAttachment: oc
    .route({
      method: "DELETE",
      path: "/environments/{envId}/databases/{databaseId}/attachment",
    })
    .input(z.object({ envId: z.string(), databaseId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  createServiceBinding: oc
    .route({ method: "POST", path: "/services/{serviceId}/database-bindings" })
    .input(
      z.object({
        serviceId: z.string(),
        databaseId: z.string(),
        envVarKey: z.string().min(1),
      }),
    )
    .output(z.object({ success: z.boolean() })),

  listServiceBindings: oc
    .route({ method: "GET", path: "/services/{serviceId}/database-bindings" })
    .input(z.object({ serviceId: z.string() }))
    .output(z.array(serviceBindingSchema)),

  deleteServiceBinding: oc
    .route({
      method: "DELETE",
      path: "/services/{serviceId}/database-bindings/{bindingId}",
    })
    .input(z.object({ serviceId: z.string(), bindingId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  listDatabaseAttachments: oc
    .route({ method: "GET", path: "/databases/{databaseId}/attachments" })
    .input(z.object({ databaseId: z.string() }))
    .output(z.array(databaseAttachmentSchema)),
};
