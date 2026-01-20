"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export interface CleanupResult {
  success: boolean;
  deletedImages: string[];
  deletedNetworks: string[];
  prunedContainers: number;
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

function parseSettings(data: {
  enabled: boolean;
  retentionDays: number;
  running: boolean;
  lastRun: string | null;
  lastResult: string | null;
}): CleanupSettings {
  return {
    enabled: data.enabled,
    keepImages: data.retentionDays,
    pruneDangling: true,
    pruneNetworks: true,
    running: data.running,
    lastRun: data.lastRun,
    lastResult: data.lastResult ? JSON.parse(data.lastResult) : null,
  };
}

export function useCleanupSettings() {
  const queryClient = useQueryClient();

  const { data, isError } = useQuery(orpc.cleanup.get.queryOptions());
  const settings = data ? parseSettings(data) : null;

  const { data: runStatusData } = useQuery({
    ...orpc.cleanup.runStatus.queryOptions(),
    refetchInterval: settings?.running ? 2000 : false,
  });

  const mergedSettings: CleanupSettings | null =
    settings && runStatusData
      ? {
          ...settings,
          running: runStatusData.running,
          lastRun: runStatusData.lastRun,
          lastResult: runStatusData.result
            ? JSON.parse(runStatusData.result)
            : settings.lastResult,
        }
      : settings;

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
    try {
      await runMutation.mutateAsync({});
    } catch {
      throw new Error("Cleanup already running");
    }
  }

  return {
    settings: mergedSettings,
    saving: updateMutation.isPending,
    error: isError ? "Failed to load cleanup settings" : "",
    updateSetting,
    runCleanup,
  };
}
