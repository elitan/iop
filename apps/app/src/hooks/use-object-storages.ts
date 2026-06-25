import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useObjectStorages(projectId: string) {
  return useQuery({
    ...orpc.objectStorages.list.queryOptions({ input: { projectId } }),
    enabled: !!projectId,
    refetchInterval: 3000,
  });
}

export function useObjectStorage(objectStorageId: string) {
  return useQuery({
    ...orpc.objectStorages.get.queryOptions({ input: { objectStorageId } }),
    enabled: !!objectStorageId,
    refetchInterval: 3000,
  });
}

export function useCreateObjectStorage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(
      data: Omit<ContractInputs["objectStorages"]["create"], "projectId">,
    ) {
      return orpc.objectStorages.create.call({ projectId, ...data });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.list.key({ input: { projectId } }),
      });
    },
  });
}

export function useCreateObjectStorageBucket(objectStorageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(
      data: Omit<
        ContractInputs["objectStorages"]["createBucket"],
        "objectStorageId"
      >,
    ) {
      return orpc.objectStorages.createBucket.call({
        objectStorageId,
        ...data,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.get.key({ input: { objectStorageId } }),
      });
    },
  });
}

export function useDeleteObjectStorageBucket(objectStorageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(bucketId: string) {
      return orpc.objectStorages.deleteBucket.call({
        objectStorageId,
        bucketId,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.get.key({ input: { objectStorageId } }),
      });
    },
  });
}

export function useCreateObjectStorageAccessKey(objectStorageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(
      data: Omit<
        ContractInputs["objectStorages"]["createAccessKey"],
        "objectStorageId"
      >,
    ) {
      return orpc.objectStorages.createAccessKey.call({
        objectStorageId,
        ...data,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.get.key({ input: { objectStorageId } }),
      });
    },
  });
}

export function useRevokeObjectStorageAccessKey(objectStorageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(accessKeyId: string) {
      return orpc.objectStorages.revokeAccessKey.call({
        objectStorageId,
        accessKeyId,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.get.key({ input: { objectStorageId } }),
      });
    },
  });
}

export function useDeleteObjectStorage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: function mutationFn(objectStorageId: string) {
      return orpc.objectStorages.delete.call({ objectStorageId });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.objectStorages.list.key({ input: { projectId } }),
      });
    },
  });
}
