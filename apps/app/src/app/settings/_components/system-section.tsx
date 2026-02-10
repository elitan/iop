"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc-client";

type UpdateState = "idle" | "preparing" | "restarting" | "success" | "failed";

export function SystemSection() {
  const queryClient = useQueryClient();
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  const { data: status } = useQuery(orpc.updates.get.queryOptions());

  const { data: updateResult, refetch: refetchResult } = useQuery({
    ...orpc.updates.getResult.queryOptions(),
    refetchInterval: updateState === "restarting" ? 2000 : false,
    retry: updateState === "restarting",
  });

  const { refetch: refetchHealth } = useQuery({
    ...orpc.health.check.queryOptions(),
    enabled: updateState === "restarting",
    refetchInterval: updateState === "restarting" ? 2000 : false,
    retry: false,
  });

  const checkMutation = useMutation(
    orpc.updates.check.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: orpc.updates.get.key() });
      },
      onError: () => {
        setError("Failed to check for updates");
      },
    }),
  );

  const applyMutation = useMutation(
    orpc.updates.apply.mutationOptions({
      onSuccess: () => {
        setUpdateState("restarting");
        pollForRestart();
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to apply update");
        setUpdateState("idle");
      },
    }),
  );

  const clearResultMutation = useMutation(
    orpc.updates.clearResult.mutationOptions(),
  );

  async function pollForRestart() {
    const startTime = Date.now();
    const maxDuration = 120000;

    const poll = async () => {
      if (Date.now() - startTime > maxDuration) {
        setUpdateState("failed");
        setError("Server did not respond after 2 minutes");
        return;
      }

      try {
        await refetchHealth();
        const resultRes = await refetchResult();
        const result = resultRes.data;

        if (result?.completed && result.success) {
          setUpdateState("success");
          await queryClient.refetchQueries({
            queryKey: orpc.updates.get.key(),
          });
        } else if (result?.completed && !result.success) {
          setUpdateState("failed");
          setShowLog(true);
        } else {
          setUpdateState("success");
          await queryClient.refetchQueries({
            queryKey: orpc.updates.get.key(),
          });
        }
      } catch {
        setTimeout(poll, 2000);
      }
    };

    setTimeout(poll, 2000);
  }

  async function handleCheck() {
    setError("");
    checkMutation.mutate({});
  }

  function handleApply() {
    setPreviousVersion(status?.currentVersion || null);
    setUpdateState("preparing");
    setError("");
    setShowLog(false);
    setShowApplyDialog(false);

    applyMutation.mutate({});
  }

  async function handleDismiss() {
    await clearResultMutation.mutateAsync({});
    setUpdateState("idle");
    setShowLog(false);
    setPreviousVersion(null);
  }

  function formatLastCheck(timestamp: string | null): string {
    if (!timestamp) return "Never";
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  const isUpdating =
    updateState === "preparing" || updateState === "restarting";

  return (
    <SettingCard
      title="System"
      description="Check for updates and manage your Frost installation."
      footer={
        updateState === "success" || updateState === "failed" ? (
          <Button variant="secondary" onClick={handleDismiss}>
            Dismiss
          </Button>
        ) : status?.updateAvailable ? (
          <Button
            onClick={() => setShowApplyDialog(true)}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {updateState === "preparing" ? "Preparing..." : "Restarting..."}
              </>
            ) : (
              "Update Now"
            )}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={handleCheck}
            disabled={checkMutation.isPending}
          >
            {checkMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Check for Updates
              </>
            )}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {updateState === "restarting" && (
          <div className="flex items-center gap-2 rounded-md bg-blue-900/20 p-3 text-blue-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <div>
              <span>Server restarting...</span>
              <p className="text-xs text-neutral-400">
                This may take up to 2 minutes.
              </p>
            </div>
          </div>
        )}

        {updateState === "success" && (
          <div className="rounded-md bg-green-900/20 p-3 text-green-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Update complete!</span>
            </div>
            {previousVersion &&
              (updateResult?.newVersion || status?.currentVersion) &&
              previousVersion !==
                (updateResult?.newVersion || status?.currentVersion) && (
                <p className="mt-1 text-sm">
                  v{previousVersion} → v
                  {updateResult?.newVersion || status?.currentVersion}
                </p>
              )}
            {updateResult?.log && (
              <button
                type="button"
                onClick={() => setShowLog(!showLog)}
                className="mt-2 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-300"
              >
                {showLog ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                View update log
              </button>
            )}
          </div>
        )}

        {updateState === "failed" && (
          <div className="rounded-md bg-red-900/20 p-3 text-red-400">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Update failed</span>
            </div>
            {error && <p className="mt-1 text-sm">{error}</p>}
            {updateResult?.log && (
              <button
                type="button"
                onClick={() => setShowLog(!showLog)}
                className="mt-2 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-300"
              >
                {showLog ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                View update log
              </button>
            )}
          </div>
        )}

        {showLog && updateResult?.log && (
          <pre className="max-h-64 overflow-auto rounded bg-neutral-900 p-3 text-xs text-neutral-300">
            {/* biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape codes */}
            {updateResult.log.replace(/\x1b\[[0-9;]*m/g, "")}
          </pre>
        )}

        {updateState === "idle" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Current Version</p>
                <p className="text-lg font-medium text-neutral-100">
                  v{status?.currentVersion || "..."}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-neutral-500">
                  Last checked: {formatLastCheck(status?.lastCheck ?? null)}
                </p>
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={checkMutation.isPending}
                  className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                  title="Check for updates"
                >
                  {checkMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            {status?.updateAvailable && status.latestVersion && (
              <div className="rounded-lg border border-blue-800 bg-blue-900/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-blue-400">
                    Update Available: v{status.latestVersion}
                  </p>
                </div>

                {status.changelog?.includes("MIGRATIONS") && (
                  <div className="mt-3 flex items-start gap-2 rounded bg-yellow-900/30 p-2 text-yellow-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      This update includes database migrations. Back up your
                      data before updating.
                    </p>
                  </div>
                )}
              </div>
            )}

            {status && !status.updateAvailable && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">
                  You're running the latest version
                </span>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
          </>
        )}
      </div>
      <ConfirmDialog
        open={showApplyDialog}
        onOpenChange={setShowApplyDialog}
        title="Apply update"
        description="This will restart Frost to apply the update. Continue?"
        confirmLabel="Update and restart"
        loading={applyMutation.isPending || updateState === "preparing"}
        onConfirm={handleApply}
      />
    </SettingCard>
  );
}
