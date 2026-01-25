"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export interface CleanupResult {
  success: boolean;
  deletedImages: string[];
  deletedNetworks: string[];
  prunedContainers: number;
  prunedBuildCacheBytes: number;
  freedBytes: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

export interface CleanupSettings {
  enabled: boolean;
  keepImages: number;
  pruneDangling: boolean;
  pruneNetworks: boolean;
  running: boolean;
  lastRun: string | null;
  lastResult: CleanupResult | null;
}

function parseResult(json: string | null): CleanupResult | null {
  if (!json) return null;
  return JSON.parse(json) as CleanupResult;
}

export function useCleanupSettings() {
  const queryClient = useQueryClient();

  const { data, isError } = useQuery(orpc.cleanup.get.queryOptions());

  const { data: runStatusData } = useQuery({
    ...orpc.cleanup.runStatus.queryOptions(),
    refetchInterval: data?.running ? 2000 : false,
  });

  const settings: CleanupSettings | null = data
    ? {
        enabled: data.enabled,
        keepImages: data.retentionDays,
        pruneDangling: true,
        pruneNetworks: true,
        running: runStatusData?.running ?? data.running,
        lastRun: runStatusData?.lastRun ?? data.lastRun,
        lastResult:
          parseResult(runStatusData?.result ?? null) ??
          parseResult(data.lastResult),
      }
    : null;

  const updateMutation = useMutation(
    orpc.cleanup.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: orpc.cleanup.get.key() });
      },
    }),
  );

  const runMutation = useMutation(
    orpc.cleanup.runStart.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: orpc.cleanup.get.key() });
      },
    }),
  );

  function updateSetting(updates: Partial<CleanupSettings>): void {
    updateMutation.mutate({
      enabled: updates.enabled,
      retentionDays: updates.keepImages,
    });
  }

  async function runCleanup(): Promise<void> {
    await runMutation.mutateAsync({});
  }

  return {
    settings,
    saving: updateMutation.isPending,
    error: isError ? "Failed to load cleanup settings" : "",
    updateSetting,
    runCleanup,
  };
}
