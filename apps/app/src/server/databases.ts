import { ORPCError } from "@orpc/server";
import {
  assertComputeService,
  createDatabase,
  createDatabaseTarget,
  createServiceDatabaseBinding,
  deleteDatabase,
  deleteDatabaseTarget,
  deleteDatabaseTargetById,
  deleteEnvironmentAttachment,
  deleteServiceDatabaseBinding,
  deployDatabaseTarget,
  getDatabase,
  getDatabaseTargetRuntime,
  listDatabaseAttachments,
  listDatabasesByProject,
  listDatabaseTargetDeployments,
  listDatabaseTargets,
  listEnvironmentDatabaseAttachments,
  listServiceDatabaseBindings,
  patchDatabaseTargetRuntimeSettings,
  putEnvironmentAttachment,
  resetDatabaseTarget,
  runPostgresTargetSql,
  startDatabaseTarget,
  stopDatabaseTarget,
} from "@/lib/database-runtime";
import { db } from "@/lib/db";
import {
  getPostgresBackupConfig,
  updatePostgresBackupConfig,
} from "@/lib/postgres-backup-config";
import {
  listPostgresBackups,
  restorePostgresBackup,
  runPostgresBackup,
  testPostgresBackupConnection,
} from "@/lib/postgres-backup-runner";
import { os } from "./orpc";

function toApiError(error: unknown) {
  if (error instanceof ORPCError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (
    message.includes("not found") ||
    message.includes("not belong") ||
    message.includes("missing attachment")
  ) {
    return new ORPCError("NOT_FOUND", { message });
  }

  if (
    message.includes("already exists") ||
    message.includes("must use") ||
    message.includes("cannot") ||
    message.includes("only") ||
    message.includes("supported") ||
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("empty") ||
    message.includes("configured") ||
    message.includes("overwrite") ||
    message.includes("select") ||
    message.includes("uppercase") ||
    message.includes("must share")
  ) {
    return new ORPCError("BAD_REQUEST", { message });
  }

  return new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

export const databases = {
  create: os.databases.create.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", input.projectId)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    try {
      return await createDatabase(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  list: os.databases.list.handler(async ({ input }) => {
    return listDatabasesByProject(input.projectId);
  }),

  get: os.databases.get.handler(async ({ input }) => {
    try {
      return await getDatabase(input.databaseId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getBackup: os.databases.getBackup.handler(async ({ input }) => {
    try {
      return await getPostgresBackupConfig(input.databaseId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  upsertBackup: os.databases.upsertBackup.handler(async ({ input }) => {
    try {
      return await updatePostgresBackupConfig({
        databaseId: input.databaseId,
        config: {
          enabled: input.enabled,
          selectedTargetIds: input.selectedTargetIds,
          intervalValue: input.intervalValue,
          intervalUnit: input.intervalUnit,
          retentionDays: input.retentionDays,
          s3Provider: input.s3Provider,
          s3Endpoint: input.s3Endpoint,
          s3Region: input.s3Region,
          s3Bucket: input.s3Bucket,
          s3Prefix: input.s3Prefix ?? "",
          s3AccessKeyId: input.s3AccessKeyId,
          s3SecretAccessKey: input.s3SecretAccessKey,
          s3ForcePathStyle:
            input.s3ForcePathStyle ?? input.s3Provider === "custom",
          includeGlobals: input.includeGlobals ?? true,
        },
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  testBackupConnection: os.databases.testBackupConnection.handler(
    async ({ input }) => {
      try {
        return await testPostgresBackupConnection(input.databaseId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  runBackup: os.databases.runBackup.handler(async ({ input }) => {
    try {
      return await runPostgresBackup(input.databaseId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listBackups: os.databases.listBackups.handler(async ({ input }) => {
    try {
      return await listPostgresBackups(input.databaseId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  restoreBackup: os.databases.restoreBackup.handler(async ({ input }) => {
    try {
      return await restorePostgresBackup({
        databaseId: input.databaseId,
        backupPath: input.backupPath,
        targetBranchName: input.targetBranchName,
        createIfMissing: input.createIfMissing,
        allowOverwrite: input.allowOverwrite,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  delete: os.databases.delete.handler(async ({ input }) => {
    try {
      await deleteDatabase(input.databaseId);
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  createTarget: os.databases.createTarget.handler(async ({ input }) => {
    try {
      return await createDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listTargets: os.databases.listTargets.handler(async ({ input }) => {
    return listDatabaseTargets(input.databaseId);
  }),

  listTargetDeployments: os.databases.listTargetDeployments.handler(
    async ({ input }) => {
      try {
        return await listDatabaseTargetDeployments(input.targetId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  deployTarget: os.databases.deployTarget.handler(async ({ input }) => {
    try {
      return await deployDatabaseTarget(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getTargetRuntime: os.databases.getTargetRuntime.handler(async ({ input }) => {
    try {
      return await getDatabaseTargetRuntime(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  runTargetSql: os.databases.runTargetSql.handler(async ({ input }) => {
    try {
      return await runPostgresTargetSql(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  patchTargetRuntimeSettings: os.databases.patchTargetRuntimeSettings.handler(
    async ({ input }) => {
      try {
        return await patchDatabaseTargetRuntimeSettings(input);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  resetTarget: os.databases.resetTarget.handler(async ({ input }) => {
    try {
      return await resetDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  startTarget: os.databases.startTarget.handler(async ({ input }) => {
    try {
      return await startDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  stopTarget: os.databases.stopTarget.handler(async ({ input }) => {
    try {
      return await stopDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  deleteTarget: os.databases.deleteTarget.handler(async ({ input }) => {
    try {
      await deleteDatabaseTarget(input);
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  deleteTargetById: os.databases.deleteTargetById.handler(async ({ input }) => {
    try {
      await deleteDatabaseTargetById(input.targetId);
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  putAttachment: os.databases.putAttachment.handler(async ({ input }) => {
    try {
      await putEnvironmentAttachment({
        environmentId: input.envId,
        databaseId: input.databaseId,
        targetId: input.targetId,
        mode: input.mode,
      });
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listEnvironmentAttachments: os.databases.listEnvironmentAttachments.handler(
    async ({ input }) => {
      return listEnvironmentDatabaseAttachments(input.envId);
    },
  ),

  deleteAttachment: os.databases.deleteAttachment.handler(async ({ input }) => {
    try {
      await deleteEnvironmentAttachment({
        environmentId: input.envId,
        databaseId: input.databaseId,
      });
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  createServiceBinding: os.databases.createServiceBinding.handler(
    async ({ input }) => {
      try {
        await assertComputeService(input.serviceId);
        await createServiceDatabaseBinding(input);
        return { success: true };
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  listServiceBindings: os.databases.listServiceBindings.handler(
    async ({ input }) => {
      return listServiceDatabaseBindings(input.serviceId);
    },
  ),

  deleteServiceBinding: os.databases.deleteServiceBinding.handler(
    async ({ input }) => {
      const binding = await db
        .selectFrom("serviceDatabaseBindings")
        .select(["id", "serviceId"])
        .where("id", "=", input.bindingId)
        .executeTakeFirst();

      if (!binding || binding.serviceId !== input.serviceId) {
        throw new ORPCError("NOT_FOUND", { message: "Binding not found" });
      }

      await deleteServiceDatabaseBinding(input.bindingId);
      return { success: true };
    },
  ),

  listDatabaseAttachments: os.databases.listDatabaseAttachments.handler(
    async ({ input }) => {
      return listDatabaseAttachments(input.databaseId);
    },
  ),
};
