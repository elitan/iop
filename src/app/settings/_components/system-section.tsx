"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";

interface UpdateInfo {
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  hasMigrations: boolean;
  htmlUrl: string | null;
  lastCheck: number | null;
}

interface UpdateResult {
  completed: boolean;
  success: boolean;
  newVersion: string | null;
  log: string | null;
}

type UpdateState = "idle" | "preparing" | "restarting" | "success" | "failed";

export function SystemSection() {
  const [status, setStatus] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/updates")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setError("Failed to load update status"));
  }, []);

  useEffect(() => {
    if (updateState !== "restarting") return;

    const startTime = Date.now();
    const maxDuration = 120000;

    pollingRef.current = setInterval(async () => {
      if (Date.now() - startTime > maxDuration) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setUpdateState("failed");
        setError("Server did not respond after 2 minutes");
        return;
      }

      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          const resultRes = await fetch("/api/updates/result");
          const result: UpdateResult = await resultRes.json();
          setUpdateResult(result);

          if (result.completed && result.success) {
            setUpdateState("success");
            const statusRes = await fetch("/api/updates");
            const newStatus = await statusRes.json();
            setStatus(newStatus);
          } else if (result.completed && !result.success) {
            setUpdateState("failed");
            setShowLog(true);
          } else {
            setUpdateState("success");
            const statusRes = await fetch("/api/updates");
            const newStatus = await statusRes.json();
            setStatus(newStatus);
          }
        }
      } catch {
        // Server still down, continue polling
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [updateState]);

  async function handleCheck() {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/updates", { method: "POST" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Failed to check for updates");
    } finally {
      setChecking(false);
    }
  }

  async function handleApply() {
    if (!confirm("This will restart Frost to apply the update. Continue?")) {
      return;
    }

    setPreviousVersion(status?.currentVersion || null);
    setUpdateState("preparing");
    setError("");
    setUpdateResult(null);
    setShowLog(false);

    try {
      const res = await fetch("/api/updates/apply", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply update");
      }
      setUpdateState("restarting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply update");
      setUpdateState("idle");
    }
  }

  function handleDismiss() {
    setUpdateState("idle");
    setUpdateResult(null);
    setShowLog(false);
    setPreviousVersion(null);
  }

  function formatLastCheck(timestamp: number | null): string {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function formatPublishedAt(dateStr: string | null): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const isUpdating =
    updateState === "preparing" || updateState === "restarting";

  return (
    <SettingCard
      title="System"
      description="Check for updates and manage your Frost installation."
      learnMoreUrl={status?.htmlUrl || undefined}
      learnMoreText="View release notes"
      footer={
        updateState === "success" || updateState === "failed" ? (
          <Button variant="secondary" onClick={handleDismiss}>
            Dismiss
          </Button>
        ) : status?.availableVersion ? (
          <Button onClick={handleApply} disabled={isUpdating}>
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
          <Button variant="secondary" onClick={handleCheck} disabled={checking}>
            {checking ? (
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
                  disabled={checking}
                  className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                  title="Check for updates"
                >
                  {checking ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            {status?.availableVersion &&
              status.availableVersion !== status.currentVersion && (
                <div className="rounded-lg border border-blue-800 bg-blue-900/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-blue-400">
                      Update Available: v{status.availableVersion}
                    </p>
                    {status.publishedAt && (
                      <p className="text-xs text-neutral-400">
                        Released {formatPublishedAt(status.publishedAt)}
                      </p>
                    )}
                  </div>

                  {status.hasMigrations && (
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

            {status && !status.availableVersion && (
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
    </SettingCard>
  );
}
