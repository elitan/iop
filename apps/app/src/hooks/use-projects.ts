import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useProjects() {
  return useQuery(orpc.projects.list.queryOptions());
}

export function useProject(projectId: string) {
  return useQuery({
    ...orpc.projects.get.queryOptions({ input: { projectId } }),
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

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["projects"]["update"], "projectId">,
    ) => orpc.projects.update.call({ projectId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { projectId } }),
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => orpc.projects.delete.call({ projectId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.list.key(),
      });
    },
  });
}

export function useDeployProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => orpc.projects.deploy.call({ projectId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.projects.get.key({ input: { projectId } }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.environments.list.key({ input: { projectId } }),
      });
    },
  });
}
