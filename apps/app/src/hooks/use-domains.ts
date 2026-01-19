import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";
import type { RouterInputs } from "@/server/index";

export function useDomains(serviceId: string) {
  return useQuery(
    orpc.domains.listByService.queryOptions({ input: { serviceId } }),
  );
}

export function useAddDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<RouterInputs["domains"]["create"], "serviceId">) =>
      orpc.domains.create.call({ serviceId, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.domains.listByService.key({ input: { serviceId } }),
      });
    },
  });
}

export function useUpdateDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Omit<RouterInputs["domains"]["update"], "id">;
    }) => orpc.domains.update.call({ id, ...data }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.domains.listByService.key({ input: { serviceId } }),
      });
    },
  });
}

export function useDeleteDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orpc.domains.delete.call({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.domains.listByService.key({ input: { serviceId } }),
      });
    },
  });
}

export function useVerifyDomainDns(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await orpc.domains.verifyDns.call({ id });
      if (result.dnsVerified) {
        await queryClient.refetchQueries({
          queryKey: orpc.domains.listByService.key({ input: { serviceId } }),
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
      const result = await orpc.domains.verifySsl.call({ id });
      if (result.working) {
        await queryClient.refetchQueries({
          queryKey: orpc.domains.listByService.key({ input: { serviceId } }),
        });
      }
      return result;
    },
  });
}

export type AddDomainInput = Omit<
  RouterInputs["domains"]["create"],
  "serviceId"
>;
export type UpdateDomainInput = Omit<RouterInputs["domains"]["update"], "id">;
