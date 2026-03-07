import { ORPCError } from "@orpc/server";
import {
  createDatabase,
  createDatabaseTarget,
  deleteDatabase,
  deleteDatabaseTarget,
  deployDatabaseTarget,
  getDatabase,
  getDatabaseTargetRuntime,
  listDatabasesByProject,
  listDatabaseTargetDeployments,
  listDatabaseTargets,
  patchDatabase,
  patchDatabaseTargetRuntimeSettings,
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
import {
  createDatabaseImportJob,
  createDatabaseImportTarget,
  getDatabaseImportJob,
  listDatabaseImportJobs,
  markDatabaseImportCutover,
  triggerDatabaseImport,
  triggerDatabaseImportVerify,
} from "@/lib/postgres-import";
import { os } from "./orpc";

function toApiError(error: unknown) {
  if (error instanceof ORPCError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (message.includes("not found") || message.includes("not belong")) {
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

async function getTargetByDatabase(databaseId: string, targetId: string) {
  const target = await db
    .selectFrom("databaseTargets")
    .selectAll()
    .where("id", "=", targetId)
    .executeTakeFirst();

  if (!target || target.databaseId !== databaseId) {
    throw new ORPCError("NOT_FOUND", { message: "Target not found" });
  }

  return target;
}

async function assertPostgresDatabase(databaseId: string) {
  const database = await getDatabase(databaseId);
  if (database.engine !== "postgres") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Branch routes are only available for postgres databases",
    });
  }
  return database;
}

async function assertPostgresBranch(databaseId: string, targetId: string) {
  await assertPostgresDatabase(databaseId);
  const target = await getTargetByDatabase(databaseId, targetId);
  if (target.kind !== "branch") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Branch routes only support branch targets",
    });
  }
  return target;
}

async function assertBranchPolicyPatchAllowed(input: {
  databaseId: string;
  targetId: string;
  ttlValue?: number | null;
  ttlUnit?: "hours" | "days" | null;
  scaleToZeroMinutes?: number | null;
}) {
  const hasTtlValue = input.ttlValue !== undefined;
  const hasTtlUnit = input.ttlUnit !== undefined;
  const touchesPolicyFields =
    hasTtlValue || hasTtlUnit || input.scaleToZeroMinutes !== undefined;

  if (!touchesPolicyFields) {
    return;
  }

  if (hasTtlValue !== hasTtlUnit) {
    throw new ORPCError("BAD_REQUEST", {
      message: "ttlValue and ttlUnit must be set together",
    });
  }

  const database = await getDatabase(input.databaseId);
  const target = await getTargetByDatabase(input.databaseId, input.targetId);

  if (database.engine !== "postgres" || target.kind !== "branch") {
    throw new ORPCError("BAD_REQUEST", {
      message: "TTL and scale to zero are only available for postgres branches",
    });
  }

  const enablesTtl = input.ttlValue !== null || input.ttlUnit !== null;
  const enablesScaleToZero = input.scaleToZeroMinutes !== null;
  if (target.name === "main" && (enablesTtl || enablesScaleToZero)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "main cannot use TTL or scale to zero",
    });
  }
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

  patch: os.databases.patch.handler(async ({ input }) => {
    try {
      return await patchDatabase(input);
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

  createImportJob: os.databases.createImportJob.handler(async ({ input }) => {
    try {
      return await createDatabaseImportJob({
        projectId: input.projectId,
        targetName: input.targetName,
        sourceUrl: input.sourceUrl,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getImportJob: os.databases.getImportJob.handler(async ({ input }) => {
    try {
      return await getDatabaseImportJob(input.jobId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listImportJobs: os.databases.listImportJobs.handler(async ({ input }) => {
    try {
      return await listDatabaseImportJobs({
        databaseId: input.databaseId,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  createImportTarget: os.databases.createImportTarget.handler(
    async ({ input }) => {
      try {
        return await createDatabaseImportTarget(input.jobId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  runImportJob: os.databases.runImportJob.handler(async ({ input }) => {
    try {
      return await triggerDatabaseImport(input.jobId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  runImportVerify: os.databases.runImportVerify.handler(async ({ input }) => {
    try {
      return await triggerDatabaseImportVerify(input.jobId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  markImportCutover: os.databases.markImportCutover.handler(
    async ({ input }) => {
      try {
        return await markDatabaseImportCutover(input.jobId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

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

  getTarget: os.databases.getTarget.handler(async ({ input }) => {
    try {
      return await getTargetByDatabase(input.databaseId, input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listTargetDeployments: os.databases.listTargetDeployments.handler(
    async ({ input }) => {
      try {
        await getTargetByDatabase(input.databaseId, input.targetId);
        return await listDatabaseTargetDeployments(input.targetId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),

  deployTarget: os.databases.deployTarget.handler(async ({ input }) => {
    try {
      await getTargetByDatabase(input.databaseId, input.targetId);
      return await deployDatabaseTarget(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getTargetRuntime: os.databases.getTargetRuntime.handler(async ({ input }) => {
    try {
      await getTargetByDatabase(input.databaseId, input.targetId);
      return await getDatabaseTargetRuntime(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  runTargetSql: os.databases.runTargetSql.handler(async ({ input }) => {
    try {
      await getTargetByDatabase(input.databaseId, input.targetId);
      return await runPostgresTargetSql({
        targetId: input.targetId,
        sql: input.sql,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  patchTargetRuntimeSettings: os.databases.patchTargetRuntimeSettings.handler(
    async ({ input }) => {
      try {
        await getTargetByDatabase(input.databaseId, input.targetId);
        await assertBranchPolicyPatchAllowed({
          databaseId: input.databaseId,
          targetId: input.targetId,
          ttlValue: input.ttlValue,
          ttlUnit: input.ttlUnit,
          scaleToZeroMinutes: input.scaleToZeroMinutes,
        });
        return await patchDatabaseTargetRuntimeSettings({
          targetId: input.targetId,
          name: input.name,
          hostname: input.hostname,
          lifecycleStatus: input.lifecycleStatus,
          ttlValue: input.ttlValue,
          ttlUnit: input.ttlUnit,
          scaleToZeroMinutes: input.scaleToZeroMinutes,
          memoryLimit: input.memoryLimit,
          cpuLimit: input.cpuLimit,
        });
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

  createBranch: os.databases.createBranch.handler(async ({ input }) => {
    try {
      await assertPostgresDatabase(input.databaseId);
      return await createDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listBranches: os.databases.listBranches.handler(async ({ input }) => {
    try {
      await assertPostgresDatabase(input.databaseId);
      const targets = await listDatabaseTargets(input.databaseId);
      return targets.filter((target) => target.kind === "branch");
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getBranch: os.databases.getBranch.handler(async ({ input }) => {
    try {
      return await assertPostgresBranch(input.databaseId, input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  patchBranch: os.databases.patchBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      await assertBranchPolicyPatchAllowed({
        databaseId: input.databaseId,
        targetId: input.targetId,
        ttlValue: input.ttlValue,
        ttlUnit: input.ttlUnit,
        scaleToZeroMinutes: input.scaleToZeroMinutes,
      });
      return await patchDatabaseTargetRuntimeSettings({
        targetId: input.targetId,
        name: input.name,
        hostname: input.hostname,
        lifecycleStatus: input.lifecycleStatus,
        ttlValue: input.ttlValue,
        ttlUnit: input.ttlUnit,
        scaleToZeroMinutes: input.scaleToZeroMinutes,
        memoryLimit: input.memoryLimit,
        cpuLimit: input.cpuLimit,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  deleteBranch: os.databases.deleteBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      await deleteDatabaseTarget(input);
      return { success: true };
    } catch (error) {
      throw toApiError(error);
    }
  }),

  deployBranch: os.databases.deployBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await deployDatabaseTarget(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  startBranch: os.databases.startBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await startDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  stopBranch: os.databases.stopBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await stopDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  resetBranch: os.databases.resetBranch.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await resetDatabaseTarget(input);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  runBranchSql: os.databases.runBranchSql.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await runPostgresTargetSql({
        targetId: input.targetId,
        sql: input.sql,
      });
    } catch (error) {
      throw toApiError(error);
    }
  }),

  getBranchRuntime: os.databases.getBranchRuntime.handler(async ({ input }) => {
    try {
      await assertPostgresBranch(input.databaseId, input.targetId);
      return await getDatabaseTargetRuntime(input.targetId);
    } catch (error) {
      throw toApiError(error);
    }
  }),

  listBranchDeployments: os.databases.listBranchDeployments.handler(
    async ({ input }) => {
      try {
        await assertPostgresBranch(input.databaseId, input.targetId);
        return await listDatabaseTargetDeployments(input.targetId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  ),
};
