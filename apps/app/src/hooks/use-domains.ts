import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractInputs } from "@/contracts";
import { orpc } from "@/lib/orpc-client";

export function useDomains(serviceId: string) {
  return useQuery(
    orpc.domains.listByService.queryOptions({ input: { serviceId } }),
  );
}

export function useAddDomain(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<ContractInputs["domains"]["create"], "serviceId">,
    ) => orpc.domains.create.call({ serviceId, ...data }),
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
      data: Omit<ContractInputs["domains"]["update"], "id">;
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
  ContractInputs["domains"]["create"],
  "serviceId"
>;
export type UpdateDomainInput = Omit<ContractInputs["domains"]["update"], "id">;
