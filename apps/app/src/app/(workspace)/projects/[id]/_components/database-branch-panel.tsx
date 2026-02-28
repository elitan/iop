"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Copy, Loader2, Trash2, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { StateTabs } from "@/components/state-tabs";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContractOutputs } from "@/contracts";
import { useDatabaseTargetLogs } from "@/hooks/use-database-target-logs";
import {
  useDatabaseTargetDeployments,
  useDatabaseTargetRuntime,
  useRunDatabaseTargetSql,
} from "@/hooks/use-databases";
import { api } from "@/lib/api";
import { getDatabaseBranchInternalHost } from "@/lib/database-hostname";
import { getTimeAgo } from "@/lib/time";
import { DatabaseTableBrowser } from "./database-table-browser";
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

type BranchPanelTab =
  | "overview"
  | "deployments"
  | "logs"
  | "tables"
  | "sql"
  | "settings";
type BranchSettingsTab = "general" | "runtime";
type DatabaseTargetSqlResult = ContractOutputs["databases"]["runTargetSql"];

const BRANCH_SETTINGS_NAV_ITEMS: { id: BranchSettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "runtime", label: "Runtime" },
];

interface DatabaseBranchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  databaseId: string;
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
    hostname?: string;
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const CPU_OPTIONS = [
  { value: "none", label: "No limit" },
  { value: "0.25", label: "0.25 vCPU", minCpus: 1 },
  { value: "0.5", label: "0.5 vCPU", minCpus: 1 },
  { value: "1", label: "1 vCPU", minCpus: 1 },
  { value: "2", label: "2 vCPU", minCpus: 2 },
  { value: "4", label: "4 vCPU", minCpus: 4 },
  { value: "8", label: "8 vCPU", minCpus: 8 },
  { value: "16", label: "16 vCPU", minCpus: 16 },
  { value: "32", label: "32 vCPU", minCpus: 32 },
];

const MEMORY_OPTIONS = [
  { value: "none", label: "No limit" },
  { value: "256m", label: "256 MB", minGB: 1 },
  { value: "512m", label: "512 MB", minGB: 1 },
  { value: "1g", label: "1 GB", minGB: 2 },
  { value: "2g", label: "2 GB", minGB: 3 },
  { value: "4g", label: "4 GB", minGB: 5 },
  { value: "8g", label: "8 GB", minGB: 9 },
  { value: "16g", label: "16 GB", minGB: 17 },
  { value: "32g", label: "32 GB", minGB: 33 },
  { value: "64g", label: "64 GB", minGB: 65 },
];

export function DatabaseBranchPanel({
  isOpen,
  onClose,
  databaseId,
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
}: DatabaseBranchPanelProps) {
  const [activeTab, setActiveTab] = useState<BranchPanelTab>("overview");
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<BranchSettingsTab>("general");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [draftBranchName, setDraftBranchName] = useState("");
  const [draftHostname, setDraftHostname] = useState("");
  const [draftMemoryLimit, setDraftMemoryLimit] = useState("");
  const [draftCpuLimit, setDraftCpuLimit] = useState("none");
  const [sqlInput, setSqlInput] = useState("select now();");
  const [sqlResult, setSqlResult] = useState<DatabaseTargetSqlResult | null>(
    null,
  );
  const [sqlError, setSqlError] = useState<string | null>(null);

  const { logs, isConnected, error } = useDatabaseTargetLogs({
    databaseId,
    targetId: branch?.id ?? "",
  });
  const { data: deployments = [] } = useDatabaseTargetDeployments(
    databaseId,
    branch?.id ?? "",
  );
  const { data: runtime } = useDatabaseTargetRuntime(
    databaseId,
    branch?.id ?? "",
  );
  const runSqlMutation = useRunDatabaseTargetSql(databaseId, branch?.id ?? "");
  const { data: hostResources } = useQuery({
    queryKey: ["hostResources"],
    queryFn: () => api.health.hostResources(),
  });

  useEffect(
    function resetTabOnBranchChange() {
      if (!branch) {
        return;
      }
      setActiveTab("overview");
      setActiveSettingsTab("general");
      setDeleteDialogOpen(false);
      setDraftBranchName(branch.name);
      setDraftHostname(branch.name);
      setSqlInput("select now();");
      setSqlResult(null);
      setSqlError(null);
    },
    [branch?.id, branch],
  );

  useEffect(
    function syncRuntimeSettingsDraft() {
      if (!runtime) {
        setDraftMemoryLimit("");
        setDraftCpuLimit("none");
        setDraftHostname(branch?.name ?? "");
        return;
      }
      setDraftMemoryLimit(runtime.memoryLimit ?? "none");
      setDraftCpuLimit(
        runtime.cpuLimit !== null ? String(runtime.cpuLimit) : "none",
      );
      setDraftHostname(runtime.hostname);
    },
    [runtime, branch?.name],
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
            ? getDatabaseBranchInternalHost(
                databaseName,
                runtime?.hostname ?? branch.name,
              )
            : `${databaseName}.frost.internal`,
        port: engine === "postgres" ? 5432 : 3306,
        providerRef,
      });
    },
    [
      branch,
      databaseName,
      engine,
      isDefaultInCurrentEnvironment,
      providerRef,
      runtime?.hostname,
    ],
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
  const nextHostname = draftHostname.trim();
  const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  const canSaveHostname =
    runtime !== undefined &&
    nextHostname.length > 0 &&
    hostnamePattern.test(nextHostname) &&
    nextHostname !== runtime.hostname;
  const nextCpuLimit = draftCpuLimit === "none" ? null : Number(draftCpuLimit);
  const nextMemoryLimit = draftMemoryLimit === "none" ? null : draftMemoryLimit;
  const hasRuntime = runtime !== undefined;
  const cpuLimitChanged = hasRuntime && nextCpuLimit !== runtime.cpuLimit;
  const memoryLimitChanged =
    hasRuntime && nextMemoryLimit !== runtime.memoryLimit;
  const canSaveCpuLimit =
    hasRuntime && nextCpuLimit !== null && cpuLimitChanged;
  const canSaveMemoryLimit =
    hasRuntime && nextMemoryLimit !== null && memoryLimitChanged;
  const filteredCpuOptions = CPU_OPTIONS.filter(
    (opt) => !opt.minCpus || (hostResources?.cpus ?? 0) >= opt.minCpus,
  );
  const filteredMemoryOptions = MEMORY_OPTIONS.filter(
    (opt) => !opt.minGB || (hostResources?.totalMemoryGB ?? 0) >= opt.minGB,
  );
  const isAnyOverviewActionPending =
    isStartPending || isResetPending || isSetAsDefaultInEnvironmentPending;
  const showSqlTab = engine === "postgres";
  const canRunSql =
    showSqlTab &&
    branch?.lifecycleStatus === "active" &&
    sqlInput.trim().length > 0 &&
    !runSqlMutation.isPending;
  const branchTabs: { id: BranchPanelTab; label: string }[] = showSqlTab
    ? [
        { id: "overview", label: "Overview" },
        { id: "tables", label: "Tables" },
        { id: "sql", label: "SQL" },
        { id: "deployments", label: "Deployments" },
        { id: "logs", label: "Logs" },
        { id: "settings", label: "Settings" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "deployments", label: "Deployments" },
        { id: "logs", label: "Logs" },
        { id: "settings", label: "Settings" },
      ];
  const showOverviewActions =
    branch?.lifecycleStatus !== "active" ||
    canReset ||
    !isDefaultInCurrentEnvironment;

  async function handleRunSql() {
    if (!canRunSql) {
      return;
    }

    setSqlError(null);
    try {
      const result = await runSqlMutation.mutateAsync({ sql: sqlInput });
      setSqlResult(result);
      if (result.command !== null) {
        toast.success(result.command);
      } else {
        toast.success(`Query returned ${result.rowCount} rows`);
      }
    } catch (error) {
      const message = getErrorMessage(error, "Failed to run SQL");
      setSqlError(message);
      setSqlResult(null);
      toast.error(message);
    }
  }

  function handleSqlKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !event.metaKey) {
      return;
    }
    event.preventDefault();
    void handleRunSql();
  }

  async function saveSettingsWithToast(
    input: {
      name?: string;
      hostname?: string;
      memoryLimit?: string;
      cpuLimit?: number;
    },
    successMessage: string,
  ) {
    await onSaveSettings(input);
    toast.success(successMessage);
  }

  async function handleSaveBranchName() {
    await saveSettingsWithToast(
      { name: nextBranchName },
      `${runtimeUnitCapitalized} renamed`,
    );
  }

  async function handleSaveHostname() {
    await saveSettingsWithToast(
      { hostname: nextHostname },
      `${runtimeUnitCapitalized} hostname saved`,
    );
  }

  async function handleSaveCpuLimit() {
    await saveSettingsWithToast(
      { cpuLimit: nextCpuLimit ?? undefined },
      `${runtimeUnitCapitalized} CPU limit saved`,
    );
  }

  async function handleSaveMemoryLimit() {
    await saveSettingsWithToast(
      { memoryLimit: nextMemoryLimit ?? undefined },
      `${runtimeUnitCapitalized} memory limit saved`,
    );
  }

  const branchContent =
    isOpen && branch ? (
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
            tabs={branchTabs}
            value={activeTab}
            onChange={setActiveTab}
            layoutId="database-branch-panel-tabs"
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            {activeTab === "overview" && (
              <div className="space-y-4">
                <Card className="border-neutral-800 bg-neutral-900">
                  <CardContent className="space-y-3 p-4 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusDot status={branch.lifecycleStatus} showLabel />
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
                          default in this environment to use the internal alias.
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

            {activeTab === "tables" && engine === "postgres" && (
              <DatabaseTableBrowser
                databaseId={databaseId}
                targetId={branch.id}
                branchName={branch.name}
                isBranchActive={branch.lifecycleStatus === "active"}
              />
            )}

            {activeTab === "sql" && engine === "postgres" && (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <Card className="border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-neutral-300">
                        Run SQL on this branch
                      </div>
                      <Badge
                        variant="outline"
                        className="border-neutral-700 text-neutral-300"
                      >
                        {branch.name}
                      </Badge>
                    </div>
                    <textarea
                      value={sqlInput}
                      onChange={(event) => setSqlInput(event.target.value)}
                      onKeyDown={handleSqlKeyDown}
                      placeholder="select now();"
                      className="min-h-40 w-full resize-y rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-neutral-500">
                        Runs directly inside this postgres branch.
                      </p>
                      <Button
                        onClick={() => {
                          void handleRunSql();
                        }}
                        disabled={!canRunSql}
                      >
                        {runSqlMutation.isPending ? (
                          <>
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          "Run SQL"
                        )}
                      </Button>
                    </div>
                    {branch.lifecycleStatus !== "active" && (
                      <p className="text-xs text-amber-400">
                        Start this branch before running SQL.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="min-h-0 flex-1 border-neutral-800 bg-neutral-950/70">
                  <CardContent className="flex h-full min-h-0 flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-neutral-300">Results</span>
                      {sqlResult && (
                        <span className="text-xs text-neutral-500">
                          {sqlResult.rowCount} rows
                        </span>
                      )}
                    </div>

                    {sqlError && (
                      <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                        {sqlError}
                      </div>
                    )}

                    {!sqlError && sqlResult === null && (
                      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-neutral-800 bg-neutral-900/40 text-sm text-neutral-500">
                        Run a query to see results.
                      </div>
                    )}

                    {!sqlError && sqlResult !== null && (
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        {sqlResult.command && (
                          <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
                            {sqlResult.command}
                          </div>
                        )}

                        {sqlResult.columns.length > 0 ? (
                          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-900">
                            <table className="min-w-full text-left font-mono text-xs text-neutral-200">
                              <thead className="sticky top-0 bg-neutral-900">
                                <tr className="border-b border-neutral-800">
                                  {sqlResult.columns.map((columnName) => (
                                    <th
                                      key={columnName}
                                      className="px-3 py-2 font-medium text-neutral-400"
                                    >
                                      {columnName}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {sqlResult.rows.length === 0 ? (
                                  <tr>
                                    <td
                                      className="px-3 py-3 text-neutral-500"
                                      colSpan={sqlResult.columns.length}
                                    >
                                      No rows.
                                    </td>
                                  </tr>
                                ) : (
                                  sqlResult.rows.map((row, rowIndex) => (
                                    <tr
                                      key={`${sqlResult.executedAt}-${rowIndex}`}
                                      className="border-b border-neutral-900/80 last:border-b-0"
                                    >
                                      {sqlResult.columns.map(
                                        function renderCell(columnName, i) {
                                          const value = row[i] ?? "";
                                          return (
                                            <td
                                              key={`${sqlResult.executedAt}-${rowIndex}-${columnName}`}
                                              className="px-3 py-2 text-neutral-200"
                                            >
                                              {value.length > 0 ? value : " "}
                                            </td>
                                          );
                                        },
                                      )}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : sqlResult.output.length > 0 &&
                          sqlResult.output !== sqlResult.command ? (
                          <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                            {sqlResult.output}
                          </pre>
                        ) : sqlResult.command === null ? (
                          <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                            Query executed.
                          </pre>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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
                    <>
                      <SettingCard
                        title={`${runtimeUnitCapitalized} Name`}
                        description={`Rename this ${runtimeUnit}`}
                        onSubmit={handleSaveBranchName}
                        footerRight={
                          <Button
                            size="sm"
                            type="submit"
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

                      <SettingCard
                        title="Hostname"
                        description="DNS-safe identifier for this branch in the project network."
                        onSubmit={handleSaveHostname}
                        footerRight={
                          <Button
                            size="sm"
                            type="submit"
                            disabled={!canSaveHostname || isSaveSettingsPending}
                          >
                            {isSaveSettingsPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        }
                      >
                        <div className="space-y-4">
                          <div className="flex items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 focus-within:ring-1 focus-within:ring-neutral-500">
                            <div className="inline-flex items-center font-mono text-sm">
                              <input
                                value={draftHostname}
                                onChange={(event) =>
                                  setDraftHostname(
                                    event.target.value.toLowerCase(),
                                  )
                                }
                                placeholder="<hostname>"
                                size={Math.max(draftHostname.length, 10) + 1}
                                className="border-b border-dashed border-neutral-600 bg-transparent text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
                              />
                              <span className="text-neutral-500">
                                .frost.internal
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm text-neutral-500">
                              {draftHostname || "<hostname>"}.frost.internal
                            </code>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-neutral-500 hover:text-neutral-300"
                              onClick={() =>
                                copyToClipboard(
                                  `${draftHostname}.frost.internal`,
                                )
                              }
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {nextHostname.length > 0 &&
                            !hostnamePattern.test(nextHostname) && (
                              <div className="text-xs text-neutral-500">
                                Use lowercase letters, numbers, and hyphens.
                              </div>
                            )}
                        </div>
                      </SettingCard>

                      <SettingCard
                        title="Delete Branch"
                        description={
                          canDelete
                            ? `Permanently delete this ${runtimeUnit}`
                            : "Main cannot be deleted."
                        }
                        variant="danger"
                        footerRight={
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
                        }
                      >
                        <div className="text-sm text-neutral-400">
                          This action cannot be undone.
                        </div>
                      </SettingCard>
                    </>
                  )}

                  {activeSettingsTab === "runtime" && (
                    <>
                      <SettingCard
                        title="CPU Limit"
                        description={`Maximum CPU cores this ${runtimeUnit} can use.`}
                        learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#cpu"
                        learnMoreText="Learn more about CPU Limit"
                        onSubmit={handleSaveCpuLimit}
                        footerRight={
                          <Button
                            size="sm"
                            type="submit"
                            disabled={!canSaveCpuLimit || isSaveSettingsPending}
                          >
                            {isSaveSettingsPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        }
                      >
                        <Select
                          value={draftCpuLimit}
                          onValueChange={setDraftCpuLimit}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCpuOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </SettingCard>

                      <SettingCard
                        title="Memory Limit"
                        description={`Maximum memory this ${runtimeUnit} can use.`}
                        learnMoreUrl="https://docs.docker.com/config/containers/resource_constraints/#memory"
                        learnMoreText="Learn more about Memory Limit"
                        onSubmit={handleSaveMemoryLimit}
                        footerRight={
                          <Button
                            size="sm"
                            type="submit"
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
                        <Select
                          value={draftMemoryLimit}
                          onValueChange={setDraftMemoryLimit}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredMemoryOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </SettingCard>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {branchContent && (
        <div className="h-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {branchContent}
        </div>
      )}

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
