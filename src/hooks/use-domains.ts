import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AddDomainInput, api, type UpdateDomainInput } from "@/lib/api";

export function useDomains(serviceId: string) {
  return useQuery({
    queryKey: ["services", serviceId, "domains"],
    queryFn: () => api.domains.list(serviceId),
  });
}

export function useAddDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddDomainInput) => api.domains.add(serviceId, data),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ["services", serviceId, "domains"],
      });
    },
  });
}

export function useUpdateDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDomainInput }) =>
      api.domains.update(id, data),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ["services", serviceId, "domains"],
      });
    },
  });
}

export function useDeleteDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.domains.delete(id),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ["services", serviceId, "domains"],
      });
    },
  });
}

export function useVerifyDomainDns(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.domains.verifyDns(id);
      if (result.dnsVerified) {
        await queryClient.refetchQueries({
          queryKey: ["services", serviceId, "domains"],
        });
      }
      return result;
    },
  });
}

export function useVerifyDomainSsl(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.domains.verifySsl(id);
      if (result.working) {
        await queryClient.refetchQueries({
          queryKey: ["services", serviceId, "domains"],
        });
      }
      return result;
    },
  });
}
