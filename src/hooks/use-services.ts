import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CreateServiceInput,
  type UpdateServiceInput,
} from "@/lib/api";

export function useServices(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "services"],
    queryFn: () => api.services.list(projectId),
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: ["services", id],
    queryFn: () => api.services.get(id),
    refetchInterval: 2000,
  });
}

export function useCreateService(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServiceInput) =>
      api.services.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "services"],
      });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useUpdateService(id: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateServiceInput) => api.services.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", id] });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "services"],
      });
    },
  });
}

export function useDeleteService(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.services.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "services"],
      });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useDeployService(id: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.services.deploy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", id] });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "services"],
      });
    },
  });
}

export function useServiceVolumes(id: string) {
  return useQuery({
    queryKey: ["services", id, "volumes"],
    queryFn: () => api.services.getVolumes(id),
  });
}
