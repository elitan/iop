import { oc } from "@orpc/contract";
import { z } from "zod";

const databaseEngineSchema = z.enum(["postgres", "mysql"]);
const databaseProviderSchema = z.enum(["postgres-docker", "mysql-docker"]);
const databaseTargetKindSchema = z.enum(["branch", "instance"]);
const databaseTargetLifecycleSchema = z.enum(["active", "stopped", "expired"]);
const attachmentModeSchema = z.enum(["managed", "manual"]);
const databaseStorageBackendSchema = z.enum(["apfs", "zfs"]);
const backupIntervalUnitSchema = z.enum(["minutes", "hours", "days"]);
const backupS3ProviderSchema = z.enum([
  "aws",
  "cloudflare",
  "backblaze",
  "custom",
]);

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
  ttlValue: z.number().nullable(),
  ttlUnit: z.enum(["hours", "days"]).nullable(),
  scaleToZeroMinutes: z.number().nullable(),
  lastActivityAt: z.number().nullable(),
  runtimeHostPort: z.number().nullable(),
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
  runtimeHostPort: z.number(),
  gatewayEnabled: z.boolean(),
  image: z.string(),
  port: z.number(),
  storageBackend: databaseStorageBackendSchema.nullable(),
  memoryLimit: z.string().nullable(),
  cpuLimit: z.number().nullable(),
  ttlValue: z.number().nullable(),
  ttlUnit: z.enum(["hours", "days"]).nullable(),
  scaleToZeroMinutes: z.number().nullable(),
  lastActivityAt: z.number().nullable(),
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

const databaseBackupConfigSchema = z.object({
  databaseId: z.string(),
  enabled: z.boolean(),
  selectedTargetIds: z.array(z.string()),
  intervalValue: z.number(),
  intervalUnit: backupIntervalUnitSchema,
  retentionDays: z.number(),
  s3Provider: backupS3ProviderSchema,
  s3Endpoint: z.string().nullable(),
  s3Region: z.string().nullable(),
  s3Bucket: z.string(),
  s3Prefix: z.string(),
  s3AccessKeyId: z.string(),
  hasSecretAccessKey: z.boolean(),
  s3ForcePathStyle: z.boolean(),
  includeGlobals: z.boolean(),
  running: z.boolean(),
  lastRunAt: z.number().nullable(),
  lastSuccessAt: z.number().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
});

const databaseBackupRunResultSchema = z.object({
  databaseId: z.string(),
  startedAt: z.number(),
  finishedAt: z.number(),
  branchResults: z.array(
    z.object({
      sourceTargetId: z.string(),
      sourceTargetName: z.string(),
      manifestKey: z.string(),
      dumpKey: z.string(),
      globalsKey: z.string().nullable(),
      createdAt: z.number(),
    }),
  ),
  deletedByRetention: z.number(),
});

const databaseBackupListItemSchema = z.object({
  backupPath: z.string(),
  sourceTargetId: z.string(),
  sourceTargetName: z.string(),
  createdAt: z.number(),
  createdAtIso: z.string(),
  dumpSizeBytes: z.number(),
  hasGlobals: z.boolean(),
});

const databaseBackupRestoreResultSchema = z.object({
  databaseId: z.string(),
  sourceTargetName: z.string(),
  targetBranchName: z.string(),
  targetId: z.string(),
  createdBranch: z.boolean(),
  startedAt: z.number(),
  finishedAt: z.number(),
  warnings: z.array(z.string()),
});

const targetParamsSchema = z.object({
  databaseId: z.string(),
  targetId: z.string(),
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

  getBackup: oc
    .route({ method: "GET", path: "/databases/{databaseId}/backup" })
    .input(z.object({ databaseId: z.string() }))
    .output(databaseBackupConfigSchema),

  upsertBackup: oc
    .route({ method: "POST", path: "/databases/{databaseId}/backup" })
    .input(
      z.object({
        databaseId: z.string(),
        enabled: z.boolean(),
        selectedTargetIds: z.array(z.string()).min(1),
        intervalValue: z.number().int().min(1),
        intervalUnit: backupIntervalUnitSchema,
        retentionDays: z.number().int().min(1),
        s3Provider: backupS3ProviderSchema,
        s3Endpoint: z.string().nullable(),
        s3Region: z.string().nullable(),
        s3Bucket: z.string().min(1),
        s3Prefix: z.string().optional(),
        s3AccessKeyId: z.string().min(1),
        s3SecretAccessKey: z.string().optional(),
        s3ForcePathStyle: z.boolean().optional(),
        includeGlobals: z.boolean().optional(),
      }),
    )
    .output(databaseBackupConfigSchema),

  testBackupConnection: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/backup/test-connection",
    })
    .input(z.object({ databaseId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  runBackup: oc
    .route({ method: "POST", path: "/databases/{databaseId}/backup/run" })
    .input(z.object({ databaseId: z.string() }))
    .output(databaseBackupRunResultSchema),

  listBackups: oc
    .route({ method: "GET", path: "/databases/{databaseId}/backup/backups" })
    .input(z.object({ databaseId: z.string() }))
    .output(z.array(databaseBackupListItemSchema)),

  restoreBackup: oc
    .route({ method: "POST", path: "/databases/{databaseId}/backup/restore" })
    .input(
      z.object({
        databaseId: z.string(),
        backupPath: z.string().min(1),
        targetBranchName: z.string().optional(),
        createIfMissing: z.boolean().optional(),
        allowOverwrite: z.boolean().optional(),
      }),
    )
    .output(databaseBackupRestoreResultSchema),

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

  getTarget: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/targets/{targetId}",
    })
    .input(targetParamsSchema)
    .output(databaseTargetSchema),

  listTargetDeployments: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/targets/{targetId}/deployments",
    })
    .input(targetParamsSchema)
    .output(z.array(databaseTargetDeploymentSchema)),

  deployTarget: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/targets/{targetId}/deploy",
    })
    .input(targetParamsSchema)
    .output(databaseTargetDeploymentSchema),

  getTargetRuntime: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/targets/{targetId}/runtime",
    })
    .input(targetParamsSchema)
    .output(databaseTargetRuntimeSchema),

  runTargetSql: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/targets/{targetId}/sql",
    })
    .input(
      targetParamsSchema.extend({
        sql: z.string().min(1),
      }),
    )
    .output(databaseTargetSqlResultSchema),

  patchTargetRuntimeSettings: oc
    .route({
      method: "PATCH",
      path: "/databases/{databaseId}/targets/{targetId}",
    })
    .input(
      targetParamsSchema.extend({
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
        ttlValue: z.number().int().min(1).max(8760).nullable().optional(),
        ttlUnit: z.enum(["hours", "days"]).nullable().optional(),
        scaleToZeroMinutes: z
          .number()
          .int()
          .min(1)
          .max(24 * 60)
          .nullable()
          .optional(),
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
    .input(targetParamsSchema)
    .output(z.object({ success: z.boolean() })),

  createBranch: oc
    .route({ method: "POST", path: "/databases/{databaseId}/branches" })
    .input(
      z.object({
        databaseId: z.string(),
        name: z.string().min(1),
        sourceTargetName: z.string().optional(),
      }),
    )
    .output(databaseTargetSchema),

  listBranches: oc
    .route({ method: "GET", path: "/databases/{databaseId}/branches" })
    .input(z.object({ databaseId: z.string() }))
    .output(z.array(databaseTargetSchema)),

  getBranch: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/branches/{targetId}",
    })
    .input(targetParamsSchema)
    .output(databaseTargetSchema),

  patchBranch: oc
    .route({
      method: "PATCH",
      path: "/databases/{databaseId}/branches/{targetId}",
    })
    .input(
      targetParamsSchema.extend({
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
        ttlValue: z.number().int().min(1).max(8760).nullable().optional(),
        ttlUnit: z.enum(["hours", "days"]).nullable().optional(),
        scaleToZeroMinutes: z
          .number()
          .int()
          .min(1)
          .max(24 * 60)
          .nullable()
          .optional(),
      }),
    )
    .output(databaseTargetRuntimeSchema),

  deleteBranch: oc
    .route({
      method: "DELETE",
      path: "/databases/{databaseId}/branches/{targetId}",
    })
    .input(targetParamsSchema)
    .output(z.object({ success: z.boolean() })),

  deployBranch: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/branches/{targetId}/deploy",
    })
    .input(targetParamsSchema)
    .output(databaseTargetDeploymentSchema),

  startBranch: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/branches/{targetId}/start",
    })
    .input(targetParamsSchema)
    .output(databaseTargetSchema),

  stopBranch: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/branches/{targetId}/stop",
    })
    .input(targetParamsSchema)
    .output(databaseTargetSchema),

  resetBranch: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/branches/{targetId}/reset",
    })
    .input(
      targetParamsSchema.extend({
        sourceTargetName: z.string(),
      }),
    )
    .output(databaseTargetSchema),

  runBranchSql: oc
    .route({
      method: "POST",
      path: "/databases/{databaseId}/branches/{targetId}/sql",
    })
    .input(
      targetParamsSchema.extend({
        sql: z.string().min(1),
      }),
    )
    .output(databaseTargetSqlResultSchema),

  getBranchRuntime: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/branches/{targetId}/runtime",
    })
    .input(targetParamsSchema)
    .output(databaseTargetRuntimeSchema),

  listBranchDeployments: oc
    .route({
      method: "GET",
      path: "/databases/{databaseId}/branches/{targetId}/deployments",
    })
    .input(targetParamsSchema)
    .output(z.array(databaseTargetDeploymentSchema)),

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
