import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useServices(environmentId: string) {
  return useQuery({
    ...orpc.services.list.queryOptions({ input: { environmentId } }),
    enabled: !!environmentId,
  });
}

interface UseServiceOptions {
  refetchInterval?: number | false;
}

export function useService(id: string, options?: UseServiceOptions) {
  return useQuery({
    ...orpc.services.get.queryOptions({ input: { id } }),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useCreateService(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["services"]["create"], "environmentId">,
    ) => orpc.services.create.call({ environmentId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.list.key({ input: { environmentId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { id: environmentId } }),
      });
    },
  });
}

export function useUpdateService(id: string, environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ContractInputs["services"]["update"], "id">) =>
      orpc.services.update.call({ id, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.get.key({ input: { id } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.services.list.key({ input: { environmentId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { id: environmentId } }),
      });
    },
  });
}

export function useDeleteService(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orpc.services.delete.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.list.key({ input: { environmentId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { id: environmentId } }),
      });
    },
  });
}

export function useDeployService(id: string, environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => orpc.services.deploy.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.get.key({ input: { id } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.services.list.key({ input: { environmentId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { id: environmentId } }),
      });
    },
  });
}

export function useServiceVolumes(id: string) {
  return useQuery(orpc.services.getVolumes.queryOptions({ input: { id } }));
}

export function useDeployments(serviceId: string) {
  return useQuery({
    ...orpc.services.listDeployments.queryOptions({ input: { id: serviceId } }),
    refetchInterval: 2000,
  });
}

export function useScanRepo() {
  return useMutation({
    mutationFn: (data: { repoUrl: string; branch: string; repoName: string }) =>
      orpc.github.scan.call(data),
  });
}

export function useBatchCreateServices(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      repoUrl: string;
      branch: string;
      services: {
        name: string;
        dockerfilePath: string;
        buildContext: string;
        containerPort?: number;
      }[];
    }) => orpc.services.createBatch.call({ environmentId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.list.key({ input: { environmentId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.key({ input: { id: environmentId } }),
      });
    },
  });
}
