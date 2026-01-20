import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useProjects() {
  return useQuery(orpc.projects.list.queryOptions());
}

export function useProject(id: string) {
  return useQuery({
    ...orpc.projects.get.queryOptions({ input: { id } }),
    refetchInterval: 2000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ContractInputs["projects"]["create"]) =>
      orpc.projects.create.call(data),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.list.key(),
      });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ContractInputs["projects"]["update"], "id">) =>
      orpc.projects.update.call({ id, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { id } }),
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orpc.projects.delete.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.list.key(),
      });
    },
  });
}

export function useDeployProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => orpc.projects.deploy.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { id } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.services.listByProject.key({ input: { projectId: id } }),
      });
    },
  });
}
