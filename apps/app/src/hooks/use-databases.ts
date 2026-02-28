import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useDatabases(projectId: string) {
  return useQuery({
    ...orpc.databases.list.queryOptions({ input: { projectId } }),
    enabled: !!projectId,
  });
}

export function useDatabase(databaseId: string) {
  return useQuery({
    ...orpc.databases.get.queryOptions({ input: { databaseId } }),
    enabled: !!databaseId,
  });
}

export function useDatabaseBackupConfig(databaseId: string) {
  return useQuery({
    ...orpc.databases.getBackup.queryOptions({ input: { databaseId } }),
    enabled: !!databaseId,
  });
}

export function useListDatabaseBackups(databaseId: string) {
  return useQuery({
    ...orpc.databases.listBackups.queryOptions({ input: { databaseId } }),
    enabled: !!databaseId,
  });
}

export function useDatabaseTargets(databaseId: string) {
  return useQuery({
    ...orpc.databases.listTargets.queryOptions({ input: { databaseId } }),
    enabled: !!databaseId,
  });
}

export function useDatabaseTargetDeployments(
  databaseId: string,
  targetId: string,
) {
  return useQuery({
    ...orpc.databases.listTargetDeployments.queryOptions({
      input: { databaseId, targetId },
    }),
    enabled: !!databaseId && !!targetId,
    refetchInterval: 3000,
  });
}

export function useDatabaseTargetRuntime(databaseId: string, targetId: string) {
  return useQuery({
    ...orpc.databases.getTargetRuntime.queryOptions({
      input: { databaseId, targetId },
    }),
    enabled: !!databaseId && !!targetId,
    refetchInterval: 3000,
  });
}

export function useRunDatabaseTargetSql(databaseId: string, targetId: string) {
  return useMutation({
    mutationFn: function mutationFn(
      data: Omit<
        ContractInputs["databases"]["runTargetSql"],
        "databaseId" | "targetId"
      >,
    ) {
      return orpc.databases.runTargetSql.call({
        databaseId,
        targetId,
        ...data,
      });
    },
  });
}

export function useDatabaseAttachments(databaseId: string) {
  return useQuery({
    ...orpc.databases.listDatabaseAttachments.queryOptions({
      input: { databaseId },
    }),
    enabled: !!databaseId,
  });
}

export function useEnvironmentDatabaseAttachments(envId: string) {
  return useQuery({
    ...orpc.databases.listEnvironmentAttachments.queryOptions({
      input: { envId },
    }),
    enabled: !!envId,
  });
}

export function useCreateDatabase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["databases"]["create"], "projectId">,
    ) => orpc.databases.create.call({ projectId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.list.key({ input: { projectId } }),
      });
    },
  });
}

export function useUpsertDatabaseBackupConfig(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["databases"]["upsertBackup"], "databaseId">,
    ) => orpc.databases.upsertBackup.call({ databaseId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getBackup.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listBackups.key({ input: { databaseId } }),
      });
    },
  });
}

export function useTestDatabaseBackupConnection(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      orpc.databases.testBackupConnection.call({
        databaseId,
      }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getBackup.key({ input: { databaseId } }),
      });
    },
  });
}

export function useRunDatabaseBackup(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      orpc.databases.runBackup.call({
        databaseId,
      }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getBackup.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listBackups.key({ input: { databaseId } }),
      });
    },
  });
}

export function useRestoreDatabaseBackup(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["databases"]["restoreBackup"], "databaseId">,
    ) => orpc.databases.restoreBackup.call({ databaseId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getBackup.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listBackups.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useDeleteDatabase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (databaseId: string) =>
      orpc.databases.delete.call({ databaseId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.list.key({ input: { projectId } }),
      });
    },
  });
}

export function useCreateDatabaseTarget(databaseId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["databases"]["createTarget"], "databaseId">,
    ) => orpc.databases.createTarget.call({ databaseId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.list.key({ input: { projectId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listDatabaseAttachments.key({
          input: { databaseId },
        }),
      });
    },
  });
}

export function useResetDatabaseTarget(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["databases"]["resetTarget"], "databaseId">,
    ) => orpc.databases.resetTarget.call({ databaseId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useStartDatabaseTarget(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId }: { targetId: string }) =>
      orpc.databases.startTarget.call({ databaseId, targetId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useStopDatabaseTarget(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId }: { targetId: string }) =>
      orpc.databases.stopTarget.call({ databaseId, targetId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useDeleteDatabaseTarget(databaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId }: { targetId: string }) =>
      orpc.databases.deleteTarget.call({ databaseId, targetId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listDatabaseAttachments.key({
          input: { databaseId },
        }),
      });
    },
  });
}

export function useDeployDatabaseTarget(databaseId: string, targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      orpc.databases.deployTarget.call({ databaseId, targetId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargetDeployments.key({
          input: { databaseId, targetId },
        }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getTargetRuntime.key({
          input: { databaseId, targetId },
        }),
      });
      await queryClient.refetchQueries();
    },
  });
}

export function usePatchDatabaseTargetRuntimeSettings(
  databaseId: string,
  targetId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        ContractInputs["databases"]["patchTargetRuntimeSettings"],
        "databaseId" | "targetId"
      >,
    ) =>
      orpc.databases.patchTargetRuntimeSettings.call({
        databaseId,
        targetId,
        ...data,
      }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.getTargetRuntime.key({
          input: { databaseId, targetId },
        }),
      });
      await queryClient.refetchQueries();
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargetDeployments.key({
          input: { databaseId, targetId },
        }),
      });
    },
  });
}

export function usePutEnvironmentDatabaseAttachment(
  envId: string,
  databaseId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        ContractInputs["databases"]["putAttachment"],
        "envId" | "databaseId"
      >,
    ) => orpc.databases.putAttachment.call({ envId, databaseId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listEnvironmentAttachments.key({
          input: { envId },
        }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { envId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useDeleteEnvironmentDatabaseAttachment(
  envId: string,
  databaseId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      orpc.databases.deleteAttachment.call({ envId, databaseId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listEnvironmentAttachments.key({
          input: { envId },
        }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { envId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });
}

export function useServiceDatabaseBindings(serviceId: string) {
  return useQuery({
    ...orpc.databases.listServiceBindings.queryOptions({
      input: { serviceId },
    }),
    enabled: !!serviceId,
  });
}

export function useCreateServiceDatabaseBinding(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        ContractInputs["databases"]["createServiceBinding"],
        "serviceId"
      >,
    ) => orpc.databases.createServiceBinding.call({ serviceId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listServiceBindings.key({
          input: { serviceId },
        }),
      });
    },
  });
}

export function useDeleteServiceDatabaseBinding(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bindingId }: { bindingId: string }) =>
      orpc.databases.deleteServiceBinding.call({ serviceId, bindingId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listServiceBindings.key({
          input: { serviceId },
        }),
      });
    },
  });
}
