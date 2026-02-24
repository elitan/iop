"use client";

import { motion } from "framer-motion";
import { Copy, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { SideDrawer } from "@/components/side-drawer";
import { StateTabs } from "@/components/state-tabs";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDatabaseTargetLogs } from "@/hooks/use-database-target-logs";
import {
  useDatabaseTargetDeployments,
  useDatabaseTargetRuntime,
} from "@/hooks/use-databases";
import { getDatabaseBranchInternalHost } from "@/lib/database-hostname";
import { getTimeAgo } from "@/lib/time";
import { RuntimeLogsPanel } from "./runtime-logs-panel";
import { RuntimeMetricsCard } from "./runtime-metrics-card";

export interface DatabaseProviderRef {
  containerName: string;
  hostPort: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  image: string;
  port: number;
}

interface Branch {
  id: string;
  name: string;
  lifecycleStatus: "active" | "stopped" | "expired";
  createdAt: number;
}

type BranchDrawerTab = "overview" | "deployments" | "logs" | "settings";
type BranchSettingsTab = "general" | "runtime" | "danger";

const BRANCH_SETTINGS_NAV_ITEMS: { id: BranchSettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "runtime", label: "Runtime" },
  { id: "danger", label: "Danger" },
];

interface DatabaseBranchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  databaseName: string;
  engine: "postgres" | "mysql";
  branch: Branch | null;
  parentBranchName: string | null;
  defaultEnvironmentNames: string[];
  isDefaultInCurrentEnvironment: boolean;
  providerRef: DatabaseProviderRef | null;
  onStart: () => Promise<void>;
  onDeploy: () => Promise<void>;
  onReset: () => Promise<void>;
  onDelete: () => Promise<void>;
  onSetAsDefaultInEnvironment: () => Promise<void>;
  onSaveSettings: (input: {
    name?: string;
    memoryLimit?: string;
    cpuLimit?: number;
  }) => Promise<void>;
  isStartPending: boolean;
  isDeployPending: boolean;
  isResetPending: boolean;
  isDeletePending: boolean;
  isSetAsDefaultInEnvironmentPending: boolean;
  isSaveSettingsPending: boolean;
}

function getConnectionString(input: {
  engine: "postgres" | "mysql";
  host: string;
  port: number;
  providerRef: DatabaseProviderRef;
}): string {
  const user = encodeURIComponent(input.providerRef.username);
  const pass = encodeURIComponent(input.providerRef.password);
  const database = encodeURIComponent(input.providerRef.database);

  if (input.engine === "postgres") {
    const sslSuffix = input.providerRef.ssl ? "?sslmode=require" : "";
    return `postgres://${user}:${pass}@${input.host}:${input.port}/${database}${sslSuffix}`;
  }

  return `mysql://${user}:${pass}@${input.host}:${input.port}/${database}`;
}

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard");
}

const MEMORY_LIMIT_PATTERN = /^\d+[kmg]$/i;

export function DatabaseBranchDrawer({
  isOpen,
  onClose,
  databaseName,
  engine,
  branch,
  parentBranchName,
  defaultEnvironmentNames,
  isDefaultInCurrentEnvironment,
  providerRef,
  onStart,
  onDeploy,
  onReset,
  onDelete,
  onSetAsDefaultInEnvironment,
  onSaveSettings,
  isStartPending,
  isDeployPending,
  isResetPending,
  isDeletePending,
  isSetAsDefaultInEnvironmentPending,
  isSaveSettingsPending,
}: DatabaseBranchDrawerProps) {
  const [activeTab, setActiveTab] = useState<BranchDrawerTab>("overview");
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<BranchSettingsTab>("general");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [draftBranchName, setDraftBranchName] = useState("");
  const [draftMemoryLimit, setDraftMemoryLimit] = useState("");
  const [draftCpuLimit, setDraftCpuLimit] = useState("");

  const { logs, isConnected, error } = useDatabaseTargetLogs({
    targetId: branch?.id ?? "",
  });
  const { data: deployments = [] } = useDatabaseTargetDeployments(
    branch?.id ?? "",
  );
  const { data: runtime } = useDatabaseTargetRuntime(branch?.id ?? "");

  useEffect(
    function resetTabOnBranchChange() {
      if (!branch) {
        return;
      }
      setActiveTab("overview");
      setActiveSettingsTab("general");
      setDeleteDialogOpen(false);
      setDraftBranchName(branch.name);
    },
    [branch?.id, branch],
  );

  useEffect(
    function syncRuntimeSettingsDraft() {
      if (!runtime) {
        setDraftMemoryLimit("");
        setDraftCpuLimit("");
        return;
      }
      setDraftMemoryLimit(runtime.memoryLimit ?? "");
      setDraftCpuLimit(
        runtime.cpuLimit !== null ? String(runtime.cpuLimit) : "",
      );
    },
    [runtime],
  );

  const internalConnectionString = useMemo(
    function getInternalConnectionString() {
      if (!branch || !providerRef) {
        return null;
      }

      if (engine !== "postgres" && !isDefaultInCurrentEnvironment) {
        return null;
      }

      return getConnectionString({
        engine,
        host:
          engine === "postgres"
            ? getDatabaseBranchInternalHost(databaseName, branch.name)
            : `${databaseName}.frost.internal`,
        port: engine === "postgres" ? 5432 : 3306,
        providerRef,
      });
    },
    [branch, databaseName, engine, isDefaultInCurrentEnvironment, providerRef],
  );

  const directConnectionString = useMemo(
    function getDirectConnectionString() {
      if (!branch || !providerRef) {
        return null;
      }
      return getConnectionString({
        engine,
        host: "127.0.0.1",
        port: providerRef.hostPort,
        providerRef,
      });
    },
    [branch, engine, providerRef],
  );

  const isMainBranch = branch?.name === "main";
  const canReset = engine === "postgres" && !isMainBranch;
  const canDelete = !isMainBranch;
  const canRename = !isMainBranch;
  const runtimeUnit = engine === "postgres" ? "branch" : "instance";
  const runtimeUnitCapitalized = engine === "postgres" ? "Branch" : "Instance";
  const nextBranchName = draftBranchName.trim();
  const canSaveBranchName =
    branch !== null &&
    nextBranchName.length > 0 &&
    nextBranchName !== branch.name;
  const nextCpuLimit =
    draftCpuLimit.trim().length === 0 ? null : Number(draftCpuLimit);
  const cpuLimitValid =
    nextCpuLimit !== null &&
    Number.isFinite(nextCpuLimit) &&
    nextCpuLimit >= 0.1 &&
    nextCpuLimit <= 64;
  const memoryLimitValid = MEMORY_LIMIT_PATTERN.test(draftMemoryLimit.trim());
  const hasRuntime = runtime !== undefined;
  const cpuLimitChanged = hasRuntime && nextCpuLimit !== runtime.cpuLimit;
  const memoryLimitChanged =
    hasRuntime && draftMemoryLimit.trim() !== (runtime.memoryLimit ?? "");
  const canSaveCpuLimit = hasRuntime && cpuLimitValid && cpuLimitChanged;
  const canSaveMemoryLimit =
    hasRuntime && memoryLimitValid && memoryLimitChanged;
  const isAnyOverviewActionPending =
    isStartPending || isResetPending || isSetAsDefaultInEnvironmentPending;
  const showOverviewActions =
    branch?.lifecycleStatus !== "active" ||
    canReset ||
    !isDefaultInCurrentEnvironment;

  return (
    <>
      <SideDrawer
        isOpen={isOpen}
        onClose={onClose}
        width="60vw"
        zIndex={40}
        fadeIn
      >
        {branch && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-neutral-200">
                    {branch.name}
                  </h3>
                  <StatusDot status={branch.lifecycleStatus} showLabel />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{engine === "postgres" ? "branch" : "instance"}</span>
                  {parentBranchName && (
                    <span>parent branch {parentBranchName}</span>
                  )}
                  <span>created {getTimeAgo(new Date(branch.createdAt))}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex h-[calc(100%-57px)] flex-col">
              <StateTabs
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "deployments", label: "Deployments" },
                  { id: "logs", label: "Logs" },
                  { id: "settings", label: "Settings" },
                ]}
                value={activeTab}
                onChange={setActiveTab}
                layoutId="database-branch-drawer-tabs"
              />

              <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    <Card className="border-neutral-800 bg-neutral-900">
                      <CardContent className="space-y-3 p-4 text-sm">
                        <div className="flex items-center gap-2">
                          <StatusDot
                            status={branch.lifecycleStatus}
                            showLabel
                          />
                          <Badge
                            variant="outline"
                            className="border-neutral-700 text-neutral-300"
                          >
                            {branch.name}
                          </Badge>
                        </div>
                        <div className="text-neutral-300">
                          Database: {databaseName}
                        </div>
                        <div className="text-neutral-500">
                          Parent branch: {parentBranchName ?? "-"}
                        </div>
                        <div className="text-neutral-500">
                          Default in envs: {defaultEnvironmentNames.length}
                        </div>
                        <div className="text-neutral-500">
                          Created: {getTimeAgo(new Date(branch.createdAt))}
                        </div>
                        {runtime && (
                          <div className="text-neutral-500">
                            Runtime id: {runtime.runtimeServiceId}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {runtime?.runtimeServiceId && (
                      <RuntimeMetricsCard
                        runtimeServiceId={runtime.runtimeServiceId}
                      />
                    )}

                    {showOverviewActions && (
                      <Card className="border-neutral-800 bg-neutral-900">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex flex-wrap gap-2">
                            {branch.lifecycleStatus !== "active" && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  void onStart();
                                }}
                                disabled={isAnyOverviewActionPending}
                              >
                                {isStartPending ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    Starting...
                                  </>
                                ) : (
                                  "Start"
                                )}
                              </Button>
                            )}
                            {canReset && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  void onReset();
                                }}
                                disabled={isAnyOverviewActionPending}
                              >
                                {isResetPending ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    Resetting...
                                  </>
                                ) : (
                                  "Reset from parent"
                                )}
                              </Button>
                            )}
                            {!isDefaultInCurrentEnvironment && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  void onSetAsDefaultInEnvironment();
                                }}
                                disabled={isAnyOverviewActionPending}
                              >
                                {isSetAsDefaultInEnvironmentPending ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    Updating...
                                  </>
                                ) : (
                                  "Set as default for this environment"
                                )}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card className="border-neutral-700 bg-neutral-800">
                      <CardContent className="space-y-4 p-4">
                        <div>
                          <p className="mb-1 text-xs text-neutral-500">
                            Internal connection
                          </p>
                          {internalConnectionString ? (
                            <div className="flex items-start gap-2">
                              <code className="flex-1 overflow-auto rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
                                {internalConnectionString}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(internalConnectionString)
                                }
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-500">
                              Set this{" "}
                              {engine === "postgres" ? "branch" : "instance"} as
                              default in this environment to use the internal
                              alias.
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="mb-1 text-xs text-neutral-500">
                            Direct host connection
                          </p>
                          {directConnectionString ? (
                            <div className="flex items-start gap-2">
                              <code className="flex-1 overflow-auto rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
                                {directConnectionString}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(directConnectionString)
                                }
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-500">
                              Connection details unavailable.
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activeTab === "deployments" && (
                  <Card className="border-neutral-800 bg-neutral-900">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-300">
                          Branch deployments
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void onDeploy();
                          }}
                          disabled={isDeployPending}
                        >
                          {isDeployPending ? (
                            <>
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              Redeploying...
                            </>
                          ) : (
                            "Redeploy"
                          )}
                        </Button>
                      </div>
                      {deployments.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          No deployments yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {deployments.map((deployment) => (
                            <div
                              key={deployment.id}
                              className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm text-neutral-200">
                                  {deployment.action}
                                </div>
                                <Badge
                                  variant="outline"
                                  className="border-neutral-700 text-neutral-300"
                                >
                                  {deployment.status}
                                </Badge>
                              </div>
                              <div className="mt-1 text-xs text-neutral-500">
                                {getTimeAgo(new Date(deployment.createdAt))}
                              </div>
                              {deployment.message && (
                                <div className="mt-1 text-xs text-neutral-500">
                                  {deployment.message}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {activeTab === "logs" && (
                  <RuntimeLogsPanel
                    logs={logs}
                    isConnected={isConnected}
                    error={error}
                    className="min-h-0 flex-1"
                    viewerClassName="min-h-0 flex-1 overflow-hidden rounded border border-neutral-800"
                    headerPrefix={
                      <Badge
                        variant="outline"
                        className="border-neutral-700 text-neutral-300"
                      >
                        {branch.name}
                      </Badge>
                    }
                  />
                )}

                {activeTab === "settings" && (
                  <div className="flex gap-6">
                    <nav className="sticky top-0 self-start w-32 shrink-0 space-y-0.5">
                      {BRANCH_SETTINGS_NAV_ITEMS.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => setActiveSettingsTab(item.id)}
                          className="relative block w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
                        >
                          {activeSettingsTab === item.id && (
                            <motion.div
                              layoutId="branch-settings-indicator"
                              className="absolute inset-0 rounded-md bg-neutral-800/80"
                              transition={{
                                type: "spring",
                                bounce: 0.15,
                                duration: 0.5,
                              }}
                            />
                          )}
                          <span
                            className={
                              activeSettingsTab === item.id
                                ? "relative z-10 text-white"
                                : "relative z-10 text-neutral-400 hover:text-neutral-200"
                            }
                          >
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </nav>

                    <div className="flex-1 space-y-4">
                      {activeSettingsTab === "general" && (
                        <SettingCard
                          title={`${runtimeUnitCapitalized} Name`}
                          description={`Rename this ${runtimeUnit}`}
                          footerRight={
                            <Button
                              size="sm"
                              onClick={async () => {
                                await onSaveSettings({ name: nextBranchName });
                                toast.success(
                                  `${runtimeUnitCapitalized} renamed`,
                                );
                              }}
                              disabled={
                                !canRename ||
                                !canSaveBranchName ||
                                isSaveSettingsPending
                              }
                            >
                              {isSaveSettingsPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Save"
                              )}
                            </Button>
                          }
                        >
                          <div className="space-y-2">
                            <Input
                              id="branch-name"
                              aria-label="Branch name"
                              value={draftBranchName}
                              onChange={(event) =>
                                setDraftBranchName(event.target.value)
                              }
                              placeholder="Branch name"
                              className="border-neutral-700 bg-neutral-800 text-neutral-100"
                              disabled={isSaveSettingsPending}
                            />
                            {!canRename && (
                              <div className="text-xs text-neutral-500">
                                main cannot be renamed.
                              </div>
                            )}
                          </div>
                        </SettingCard>
                      )}

                      {activeSettingsTab === "runtime" && (
                        <>
                          <SettingCard
                            title="CPU Limit"
                            description={`Maximum CPU cores this ${runtimeUnit} can use.`}
                            learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#cpu"
                            learnMoreText="Learn more about CPU Limit"
                            footerRight={
                              <Button
                                size="sm"
                                onClick={async () => {
                                  if (!cpuLimitValid) {
                                    return;
                                  }
                                  await onSaveSettings({
                                    cpuLimit: nextCpuLimit ?? undefined,
                                  });
                                  toast.success(
                                    `${runtimeUnitCapitalized} CPU limit saved`,
                                  );
                                }}
                                disabled={
                                  !canSaveCpuLimit || isSaveSettingsPending
                                }
                              >
                                {isSaveSettingsPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                            }
                          >
                            <div className="space-y-2">
                              <Input
                                id="branch-cpu-limit"
                                aria-label="CPU limit"
                                value={draftCpuLimit}
                                onChange={(event) =>
                                  setDraftCpuLimit(event.target.value)
                                }
                                placeholder="1"
                                className="border-neutral-700 bg-neutral-800 text-neutral-100"
                                disabled={isSaveSettingsPending}
                              />
                              {!cpuLimitValid && (
                                <div className="text-xs text-neutral-500">
                                  Enter a number between 0.1 and 64.
                                </div>
                              )}
                            </div>
                          </SettingCard>

                          <SettingCard
                            title="Memory Limit"
                            description={`Maximum memory this ${runtimeUnit} can use.`}
                            learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#memory"
                            learnMoreText="Learn more about Memory Limit"
                            footerRight={
                              <Button
                                size="sm"
                                onClick={async () => {
                                  if (!memoryLimitValid) {
                                    return;
                                  }
                                  await onSaveSettings({
                                    memoryLimit: draftMemoryLimit.trim(),
                                  });
                                  toast.success(
                                    `${runtimeUnitCapitalized} memory limit saved`,
                                  );
                                }}
                                disabled={
                                  !canSaveMemoryLimit || isSaveSettingsPending
                                }
                              >
                                {isSaveSettingsPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                            }
                          >
                            <div className="space-y-2">
                              <Input
                                id="branch-memory-limit"
                                aria-label="Memory limit"
                                value={draftMemoryLimit}
                                onChange={(event) =>
                                  setDraftMemoryLimit(event.target.value)
                                }
                                placeholder="512m"
                                className="border-neutral-700 bg-neutral-800 text-neutral-100"
                                disabled={isSaveSettingsPending}
                              />
                              {!memoryLimitValid && (
                                <div className="text-xs text-neutral-500">
                                  Use values like 512m or 1g.
                                </div>
                              )}
                            </div>
                          </SettingCard>
                        </>
                      )}

                      {activeSettingsTab === "danger" && (
                        <SettingCard
                          title="Danger zone"
                          description={`Irreversible actions for this ${runtimeUnit}.`}
                          variant="danger"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-neutral-300">
                                Delete {runtimeUnitCapitalized}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {canDelete
                                  ? `Permanently delete this ${runtimeUnit}`
                                  : "Main cannot be deleted."}
                              </p>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteDialogOpen(true)}
                              disabled={!canDelete || isDeletePending}
                            >
                              {isDeletePending ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-4 w-4" />
                              )}
                              Delete {runtimeUnitCapitalized}
                            </Button>
                          </div>
                        </SettingCard>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SideDrawer>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${engine === "postgres" ? "branch" : "instance"}`}
        description={`Delete ${branch?.name ?? "branch"}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={isDeletePending}
        onConfirm={async () => {
          await onDelete();
          setDeleteDialogOpen(false);
        }}
      />
    </>
  );
}
