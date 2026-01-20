import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useServices(projectId: string) {
  return useQuery(
    orpc.services.listByProject.queryOptions({ input: { projectId } }),
  );
}

export function useService(id: string) {
  return useQuery({
    ...orpc.services.get.queryOptions({ input: { id } }),
    refetchInterval: 2000,
  });
}

export function useCreateService(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["services"]["create"], "projectId">,
    ) => orpc.services.create.call({ projectId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.listByProject.key({ input: { projectId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { id: projectId } }),
      });
    },
  });
}

export function useUpdateService(id: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ContractInputs["services"]["update"], "id">) =>
      orpc.services.update.call({ id, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.get.key({ input: { id } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.services.listByProject.key({ input: { projectId } }),
      });
    },
  });
}

export function useDeleteService(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orpc.services.delete.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.listByProject.key({ input: { projectId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { id: projectId } }),
      });
    },
  });
}

export function useDeployService(id: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => orpc.services.deploy.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.services.get.key({ input: { id } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.services.listByProject.key({ input: { projectId } }),
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
