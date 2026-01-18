"use client";

import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import type { CleanupSettings } from "./use-cleanup-settings";

interface RunCleanupCardProps {
  settings: CleanupSettings;
  onRun: () => void;
  error: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

export function RunCleanupCard({
  settings,
  onRun,
  error,
}: RunCleanupCardProps) {
  return (
    <SettingCard
      title="Manual Cleanup"
      description="Run cleanup immediately instead of waiting for the scheduled time. This uses the settings configured above."
      footerRight={
        <Button onClick={onRun} disabled={settings.running} variant="secondary">
          {settings.running ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-4 w-4" />
              Run Now
            </>
          )}
        </Button>
      }
    >
      <div className="space-y-4">
        {settings.lastResult && (
          <div
            className={`rounded-md p-3 ${
              settings.lastResult.success
                ? "bg-green-900/20 text-green-400"
                : "bg-red-900/20 text-red-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {settings.lastResult.success ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span className="font-medium">
                Last run: {formatDate(settings.lastRun)}
              </span>
            </div>
            <div className="mt-2 text-sm">
              <p>
                Freed: {formatBytes(settings.lastResult.freedBytes)} •{" "}
                {settings.lastResult.deletedImages.length} images •{" "}
                {settings.lastResult.prunedContainers} containers •{" "}
                {settings.lastResult.deletedNetworks.length} networks
              </p>
              {settings.lastResult.errors.length > 0 && (
                <p className="mt-1 text-red-400">
                  {settings.lastResult.errors.length} error(s)
                </p>
              )}
            </div>
          </div>
        )}

        {!settings.lastResult && (
          <p className="text-sm text-neutral-500">
            Last run: {formatDate(settings.lastRun)}
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </SettingCard>
  );
}
