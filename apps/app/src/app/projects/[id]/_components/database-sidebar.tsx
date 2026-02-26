"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Copy, Loader2, MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDatabaseTargetLogs } from "@/hooks/use-database-target-logs";
import {
  useCreateDatabaseTarget,
  useDatabase,
  useDatabaseAttachments,
  useDatabaseTargetDeployments,
  useDatabaseTargets,
  useDeleteDatabase,
  useDeleteDatabaseTarget,
  useDeleteEnvironmentDatabaseAttachment,
  useDeployDatabaseTarget,
  useEnvironmentDatabaseAttachments,
  usePatchDatabaseTargetRuntimeSettings,
  usePutEnvironmentDatabaseAttachment,
  useResetDatabaseTarget,
  useStartDatabaseTarget,
} from "@/hooks/use-databases";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoAlt,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";
import { orpc } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/time";
import {
  DatabaseBranchDrawer,
  type DatabaseProviderRef,
} from "./database-branch-drawer";
import {
  type CoreSidebarExtraTab,
  ResourceSidebarCore,
} from "./resource-sidebar-core";
import { RuntimeLogsPanel } from "./runtime-logs-panel";

interface DatabaseSidebarProps {
  projectId: string;
  environmentId: string;
  databaseId: string | null;
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  onClose: () => void;
}

function parseProviderRef(json: string): DatabaseProviderRef | null {
  try {
    const value = JSON.parse(json) as Partial<DatabaseProviderRef>;
    if (
      typeof value.containerName !== "string" ||
      typeof value.hostPort !== "number" ||
      typeof value.username !== "string" ||
      typeof value.password !== "string" ||
      typeof value.database !== "string" ||
      typeof value.ssl !== "boolean" ||
      typeof value.image !== "string" ||
      typeof value.port !== "number"
    ) {
      return null;
    }

    return value as DatabaseProviderRef;
  } catch {
    return null;
  }
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

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard");
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface BranchTreeTarget {
  id: string;
  name: string;
  sourceTargetId: string | null;
  lifecycleStatus: "active" | "stopped" | "expired";
  createdAt: number;
}

interface BranchTreeRow {
  target: BranchTreeTarget;
  depth: number;
}

function buildBranchTreeRows(targets: BranchTreeTarget[]): BranchTreeRow[] {
  const byId = new Map<string, BranchTreeTarget>(
    targets.map((target) => [target.id, target]),
  );
  const rootKey = "__root__";
  const childrenByParent = new Map<string, BranchTreeTarget[]>();

  for (const target of targets) {
    const parentId =
      target.sourceTargetId && byId.has(target.sourceTargetId)
        ? target.sourceTargetId
        : rootKey;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(target);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return left.name.localeCompare(right.name);
    });
  }

  const rows: BranchTreeRow[] = [];

  function walk(parentId: string, depth: number) {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      rows.push({ target: child, depth });
      walk(child.id, depth + 1);
    }
  }

  walk(rootKey, 0);
  return rows;
}

type PostgresSettingsTab = "general" | "danger";
type BranchRowAction = "reset" | "delete";

const POSTGRES_SETTINGS_NAV_ITEMS: {
  id: PostgresSettingsTab;
  label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "danger", label: "Danger" },
];

interface PostgresSettingsPanelProps {
  databaseName: string;
  databaseEngine: "postgres" | "mysql";
  databaseProvider: string;
  defaultBranchName: string | null;
  onDelete: () => void;
  isDeletePending: boolean;
}

function PostgresSettingsPanel({
  databaseName,
  databaseEngine,
  databaseProvider,
  defaultBranchName,
  onDelete,
  isDeletePending,
}: PostgresSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<PostgresSettingsTab>("general");

  return (
    <div className="flex gap-6">
      <nav className="sticky top-0 self-start w-32 shrink-0 space-y-0.5">
        {POSTGRES_SETTINGS_NAV_ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className="relative block w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
          >
            {activeTab === item.id && (
              <motion.div
                layoutId="postgres-settings-indicator"
                className="absolute inset-0 rounded-md bg-neutral-800/80"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span
              className={
                activeTab === item.id
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
        {activeTab === "general" && (
          <SettingCard title="General" description="Database-level settings">
            <div className="space-y-2 text-sm text-neutral-300">
              <div>Name: {databaseName}</div>
              <div>Engine: {databaseEngine}</div>
              <div>Provider: {databaseProvider}</div>
              <div>Default branch: {defaultBranchName ?? "main"}</div>
            </div>
          </SettingCard>
        )}

        {activeTab === "danger" && (
          <SettingCard
            title="Danger zone"
            description="Delete this database and all branches"
            variant="danger"
            footerRight={
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={isDeletePending}
              >
                {isDeletePending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete database"
                )}
              </Button>
            }
          >
            <div className="text-sm text-neutral-400">
              This action cannot be undone.
            </div>
          </SettingCard>
        )}
      </div>
    </div>
  );
}

export function DatabaseSidebar({
  projectId,
  environmentId,
  databaseId,
  branchId,
  onBranchChange,
  onClose,
}: DatabaseSidebarProps) {
  const queryClient = useQueryClient();
  const [drawerLogoSrc, setDrawerLogoSrc] = useState<string>(
    DATABASE_LOGO_FALLBACK,
  );
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [renameBranchOpen, setRenameBranchOpen] = useState(false);
  const [renameBranchId, setRenameBranchId] = useState<string | null>(null);
  const [renameBranchName, setRenameBranchName] = useState("");
  const [isRenameBranchPending, setIsRenameBranchPending] = useState(false);
  const [pendingBranchRowAction, setPendingBranchRowAction] = useState<{
    targetId: string;
    action: BranchRowAction;
  } | null>(null);
  const [newTargetName, setNewTargetName] = useState("");
  const [parentBranchName, setParentBranchName] = useState("main");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [branchDrawerBranchId, setBranchDrawerBranchId] = useState<
    string | null
  >(branchId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isBranchDrawerOpen = branchDrawerBranchId !== null;

  const safeDatabaseId = databaseId ?? "";

  const { data: database } = useDatabase(safeDatabaseId);
  const { data: targets = [] } = useDatabaseTargets(safeDatabaseId);
  const { data: attachments = [] } = useDatabaseAttachments(safeDatabaseId);
  const { data: envAttachments = [] } =
    useEnvironmentDatabaseAttachments(environmentId);

  const createTargetMutation = useCreateDatabaseTarget(
    safeDatabaseId,
    projectId,
  );
  const resetTargetMutation = useResetDatabaseTarget(safeDatabaseId);
  const startTargetMutation = useStartDatabaseTarget(safeDatabaseId);
  const deleteTargetMutation = useDeleteDatabaseTarget(safeDatabaseId);
  const putAttachmentMutation = usePutEnvironmentDatabaseAttachment(
    environmentId,
    safeDatabaseId,
  );
  const deleteAttachmentMutation = useDeleteEnvironmentDatabaseAttachment(
    environmentId,
    safeDatabaseId,
  );
  const deleteDatabaseMutation = useDeleteDatabase(projectId);
  const deployTargetMutation = useDeployDatabaseTarget(
    branchDrawerBranchId ?? "",
  );
  const patchTargetRuntimeSettingsMutation =
    usePatchDatabaseTargetRuntimeSettings(branchDrawerBranchId ?? "");

  const envAttachment = envAttachments.find(
    (attachment) => attachment.databaseId === safeDatabaseId,
  );

  const parentBranchOptions = useMemo(
    function getParentBranchOptions() {
      return targets.map((target) => target.name);
    },
    [targets],
  );

  const currentTarget = useMemo(
    function getCurrentTarget() {
      if (!envAttachment) {
        return null;
      }

      return (
        targets.find((target) => target.id === envAttachment.targetId) ?? null
      );
    },
    [envAttachment, targets],
  );

  const selectedBranch = useMemo(
    function getSelectedBranchTarget() {
      if (!branchDrawerBranchId) {
        return null;
      }

      return (
        targets.find((target) => target.id === branchDrawerBranchId) ?? null
      );
    },
    [branchDrawerBranchId, targets],
  );

  const renameBranchTarget = useMemo(
    function getRenameBranchTarget() {
      if (!renameBranchId) {
        return null;
      }

      return targets.find((target) => target.id === renameBranchId) ?? null;
    },
    [renameBranchId, targets],
  );

  const currentProviderRef = useMemo(
    function getCurrentProviderRef() {
      if (!currentTarget) {
        return null;
      }
      return parseProviderRef(currentTarget.providerRefJson);
    },
    [currentTarget],
  );

  const selectedBranchProviderRef = useMemo(
    function getSelectedBranchProviderRef() {
      if (!selectedBranch) {
        return null;
      }
      return parseProviderRef(selectedBranch.providerRefJson);
    },
    [selectedBranch],
  );

  const selectedBranchParentName = useMemo(
    function getSelectedBranchParentBranchName() {
      if (!selectedBranch?.sourceTargetId) {
        return null;
      }

      return (
        targets.find((target) => target.id === selectedBranch.sourceTargetId)
          ?.name ?? null
      );
    },
    [selectedBranch, targets],
  );

  const parentNameByTargetId = useMemo(
    function getParentNameByTargetId() {
      const map = new Map<string, string | null>();
      const byId = new Map(targets.map((target) => [target.id, target]));
      for (const target of targets) {
        const parent =
          target.sourceTargetId !== null
            ? (byId.get(target.sourceTargetId)?.name ?? null)
            : null;
        map.set(target.id, parent);
      }
      return map;
    },
    [targets],
  );

  const orderedBranchRows = useMemo(
    function getOrderedBranchRows() {
      return buildBranchTreeRows(
        targets.map((target) => ({
          id: target.id,
          name: target.name,
          sourceTargetId: target.sourceTargetId,
          lifecycleStatus: target.lifecycleStatus,
          createdAt: target.createdAt,
        })),
      );
    },
    [targets],
  );

  const selectedBranchDefaultEnvNames = useMemo(
    function getSelectedBranchDefaultEnvNames() {
      if (!selectedBranch) {
        return [];
      }

      return attachments
        .filter((attachment) => attachment.targetId === selectedBranch.id)
        .map((attachment) => attachment.environmentName);
    },
    [attachments, selectedBranch],
  );

  const activeRuntimeTarget = useMemo(
    function getActiveRuntimeTarget() {
      if (currentTarget) {
        return currentTarget;
      }
      return targets[0] ?? null;
    },
    [currentTarget, targets],
  );

  const currentInternalConnectionString = useMemo(
    function getCurrentInternalConnectionString() {
      if (!database || !currentProviderRef) {
        return null;
      }

      return getConnectionString({
        engine: database.engine,
        host: `${database.name}.frost.internal`,
        port: database.engine === "postgres" ? 5432 : 3306,
        providerRef: currentProviderRef,
      });
    },
    [currentProviderRef, database],
  );

  const rootDeployTargetMutation = useDeployDatabaseTarget(
    activeRuntimeTarget?.id ?? "",
  );
  const { data: activeTargetDeployments = [] } = useDatabaseTargetDeployments(
    activeRuntimeTarget?.id ?? "",
  );

  const { logs, isConnected, error } = useDatabaseTargetLogs({
    targetId: activeRuntimeTarget?.id ?? "",
  });

  useEffect(
    function resetViewOnDatabaseChange() {
      if (!databaseId) {
        return;
      }

      setNewTargetName("");
      setSelectedTargetId("");
      setBranchDrawerBranchId(null);
      setCreateBranchOpen(false);
      setRenameBranchOpen(false);
      setRenameBranchId(null);
      setRenameBranchName("");
    },
    [databaseId],
  );

  useEffect(
    function syncBranchDrawerTargetFromProps() {
      setBranchDrawerBranchId(branchId);
    },
    [branchId],
  );

  useEffect(
    function syncDrawerLogo() {
      if (!database?.engine) {
        setDrawerLogoSrc(DATABASE_LOGO_FALLBACK);
        return;
      }
      setDrawerLogoSrc(getDatabaseLogoUrl(database.engine));
    },
    [database?.engine],
  );

  useEffect(
    function syncParentBranchName() {
      if (parentBranchOptions.length === 0) {
        setParentBranchName("");
        return;
      }

      if (parentBranchOptions.includes(parentBranchName)) {
        return;
      }

      if (parentBranchOptions.includes("main")) {
        setParentBranchName("main");
        return;
      }

      setParentBranchName(parentBranchOptions[0]);
    },
    [parentBranchOptions, parentBranchName],
  );

  useEffect(
    function closeBranchDrawerIfTargetRemoved() {
      if (!branchDrawerBranchId) {
        return;
      }

      if (!targets.some((target) => target.id === branchDrawerBranchId)) {
        setBranchDrawerBranchId(null);
        onBranchChange(null);
      }
    },
    [branchDrawerBranchId, onBranchChange, targets],
  );

  function openBranchDrawer(branchId: string) {
    setBranchDrawerBranchId(branchId);
    onBranchChange(branchId);
  }

  function closeBranchDrawer() {
    setBranchDrawerBranchId(null);
    onBranchChange(null);
  }

  function handleCreateBranchOpenChange(nextOpen: boolean) {
    if (!nextOpen && createTargetMutation.isPending) {
      return;
    }
    if (!nextOpen) {
      setNewTargetName("");
    }
    setCreateBranchOpen(nextOpen);
  }

  function handleRenameBranchOpenChange(nextOpen: boolean) {
    if (!nextOpen && isRenameBranchPending) {
      return;
    }
    if (!nextOpen) {
      setRenameBranchId(null);
      setRenameBranchName("");
    }
    setRenameBranchOpen(nextOpen);
  }

  function openRenameBranchDialog(targetId: string) {
    const target = targets.find((item) => item.id === targetId);
    if (!target || target.name === "main") {
      return;
    }
    setRenameBranchId(target.id);
    setRenameBranchName(target.name);
    setRenameBranchOpen(true);
  }

  async function handleCreateTarget() {
    if (!database) {
      return;
    }

    const name = newTargetName.trim();
    if (!name) {
      return;
    }

    try {
      await createTargetMutation.mutateAsync({
        name,
        sourceTargetName:
          database.engine === "postgres" ? parentBranchName : undefined,
      });
      setNewTargetName("");
      if (database.engine === "postgres") {
        setCreateBranchOpen(false);
      }
      toast.success(`${runtimeUnitCapitalized} created`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Failed to create ${runtimeUnit}`));
    }
  }

  async function handleAttachTarget() {
    if (!selectedTargetId) {
      return;
    }

    try {
      await putAttachmentMutation.mutateAsync({
        targetId: selectedTargetId,
        mode: "manual",
      });
      setSelectedTargetId("");
      toast.success("Attachment updated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update attachment"));
    }
  }

  async function handleSetDefaultTarget(targetId: string) {
    try {
      await putAttachmentMutation.mutateAsync({
        targetId,
        mode: "manual",
      });
      toast.success(`Default ${runtimeUnit} updated`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update default target"));
    }
  }

  async function handleDetachTarget() {
    try {
      await deleteAttachmentMutation.mutateAsync();
      toast.success("Detached");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to detach"));
    }
  }

  function handleAttachTargetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleAttachTarget();
  }

  function handleCreateTargetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCreateTarget();
  }

  async function handleResetTarget(targetId: string, sourceTargetName: string) {
    try {
      await resetTargetMutation.mutateAsync({
        targetId,
        sourceTargetName,
      });
      toast.success(`${runtimeUnitCapitalized} reset`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Failed to reset ${runtimeUnit}`));
    }
  }

  async function handleRenameBranch() {
    const targetId = renameBranchId;
    const nextName = renameBranchName.trim();
    if (!targetId || nextName.length === 0) {
      return;
    }

    setIsRenameBranchPending(true);
    try {
      await orpc.databases.patchTargetRuntimeSettings.call({
        targetId,
        name: nextName,
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({
          input: { databaseId: safeDatabaseId },
        }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listEnvironmentAttachments.key({
          input: { envId: environmentId },
        }),
      });
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listDatabaseAttachments.key({
          input: { databaseId: safeDatabaseId },
        }),
      });
      toast.success("Branch renamed");
      handleRenameBranchOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to rename branch"));
    } finally {
      setIsRenameBranchPending(false);
    }
  }

  function handleRenameBranchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleRenameBranch();
  }

  async function handleStartTarget(targetId: string) {
    try {
      await startTargetMutation.mutateAsync({ targetId });
      toast.success(`${runtimeUnitCapitalized} started`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Failed to start ${runtimeUnit}`));
    }
  }

  async function handleDeleteTarget(targetId: string) {
    try {
      await deleteTargetMutation.mutateAsync({ targetId });
      if (branchDrawerBranchId === targetId) {
        closeBranchDrawer();
      }
      toast.success(`${runtimeUnitCapitalized} deleted`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Failed to delete ${runtimeUnit}`));
    }
  }

  async function runBranchRowAction(
    targetId: string,
    action: BranchRowAction,
    callback: () => Promise<void>,
  ) {
    setPendingBranchRowAction({ targetId, action });
    try {
      await callback();
    } finally {
      setPendingBranchRowAction(function clearCurrent(current) {
        if (!current) {
          return current;
        }
        if (current.targetId !== targetId || current.action !== action) {
          return current;
        }
        return null;
      });
    }
  }

  async function handleDeleteDatabase() {
    if (!database) {
      return;
    }

    try {
      await deleteDatabaseMutation.mutateAsync(database.id);
      setDeleteDialogOpen(false);
      closeBranchDrawer();
      onClose();
      toast.success("Database deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete database"));
    }
  }

  async function handleSaveBranchSettings(input: {
    name?: string;
    hostname?: string;
    memoryLimit?: string;
    cpuLimit?: number;
  }) {
    if (!selectedBranch) {
      return;
    }

    await patchTargetRuntimeSettingsMutation.mutateAsync(input);
  }

  function handleDrawerLogoError() {
    if (drawerLogoSrc === DATABASE_LOGO_FALLBACK) {
      return;
    }
    setDrawerLogoSrc(DATABASE_LOGO_FALLBACK);
  }

  const isPostgres = database?.engine === "postgres";
  const runtimeUnit = isPostgres ? "branch" : "instance";
  const runtimeUnitCapitalized = isPostgres ? "Branch" : "Instance";
  const runtimeUnitPlural = isPostgres ? "branches" : "instances";
  const isAnyBranchRowActionPending =
    resetTargetMutation.isPending || deleteTargetMutation.isPending;

  const coreSections = database
    ? {
        overview: isPostgres ? (
          <div />
        ) : (
          <div className="space-y-4">
            <Card className="border-neutral-700 bg-neutral-800">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <StatusDot
                    status={currentTarget?.lifecycleStatus ?? "stopped"}
                    showLabel
                  />
                </div>

                <div className="mb-3">
                  <p className="font-mono text-sm text-neutral-300">
                    {envAttachment?.targetName ?? "no instance attached"}
                  </p>
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
                    {database.engine}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
                    {database.provider}
                  </span>
                  {envAttachment && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
                      {envAttachment.mode}
                    </span>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  {currentTarget
                    ? `Active since ${getTimeAgo(new Date(currentTarget.createdAt))}`
                    : "Attach an instance to activate this database in this environment"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-neutral-700 bg-neutral-800">
              <CardContent className="space-y-4 p-4">
                <div>
                  <p className="mb-1 text-xs text-neutral-500">
                    Internal Connection (within project)
                  </p>
                  {currentInternalConnectionString ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 overflow-auto rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
                        {currentInternalConnectionString}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(currentInternalConnectionString)
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-500">
                      Attach an instance to see a connection string.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ),
        deployments: isPostgres ? (
          <div />
        ) : (
          <Card className="border-neutral-800 bg-neutral-900">
            <CardContent className="space-y-3 p-4">
              {!activeRuntimeTarget ? (
                <p className="text-sm text-neutral-500">No instances yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">
                      Instance deployments
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await rootDeployTargetMutation.mutateAsync();
                        toast.success("Instance redeployed");
                      }}
                      disabled={rootDeployTargetMutation.isPending}
                    >
                      Redeploy
                    </Button>
                  </div>
                  {activeTargetDeployments.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No deployments yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeTargetDeployments.map((deployment) => (
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
                  <button
                    type="button"
                    onClick={() => openBranchDrawer(activeRuntimeTarget.id)}
                    className="flex w-full items-center justify-between rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-left hover:border-neutral-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-neutral-200">
                        {activeRuntimeTarget.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatDate(activeRuntimeTarget.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-neutral-700 text-neutral-300"
                    >
                      Open instance
                    </Badge>
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        ),
        logs: isPostgres ? (
          <div />
        ) : (
          <Card className="border-neutral-800 bg-neutral-900">
            <CardContent className="space-y-3 p-4">
              {!activeRuntimeTarget ? (
                <p className="text-sm text-neutral-500">
                  Attach an instance to stream runtime logs.
                </p>
              ) : (
                <RuntimeLogsPanel
                  logs={logs}
                  isConnected={isConnected}
                  error={error}
                  className="h-[420px]"
                  viewerClassName="overflow-hidden rounded border border-neutral-800"
                  headerPrefix={
                    <Badge
                      variant="outline"
                      className="border-neutral-700 text-neutral-300"
                    >
                      {activeRuntimeTarget.name}
                    </Badge>
                  }
                />
              )}
            </CardContent>
          </Card>
        ),
        settings: isPostgres ? (
          <PostgresSettingsPanel
            databaseName={database.name}
            databaseEngine={database.engine}
            databaseProvider={database.provider}
            defaultBranchName={envAttachment?.targetName ?? null}
            onDelete={() => setDeleteDialogOpen(true)}
            isDeletePending={deleteDatabaseMutation.isPending}
          />
        ) : (
          <div className="space-y-4">
            <SettingCard title="General" description="Database-level settings">
              <div className="space-y-2 text-sm text-neutral-300">
                <div>Name: {database.name}</div>
                <div>Engine: {database.engine}</div>
                <div>Provider: {database.provider}</div>
                <div>
                  Current instance:{" "}
                  {envAttachment?.targetName ?? "not attached"}
                </div>
              </div>
            </SettingCard>

            <SettingCard
              title="Danger zone"
              description="Delete this database and all instances"
              variant="danger"
              footerRight={
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteDatabaseMutation.isPending}
                >
                  Delete database
                </Button>
              }
            >
              <div className="text-sm text-neutral-400">
                This action cannot be undone.
              </div>
            </SettingCard>
          </div>
        ),
      }
    : null;

  const extraTabs: CoreSidebarExtraTab<"branches">[] = database
    ? [
        {
          id: "branches",
          label: database.engine === "postgres" ? "Branches" : "Instances",
          content:
            database.engine === "postgres" ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-100">
                      Branches
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Each branch contains a database schema that can be edited.
                    </p>
                  </div>
                  <Button onClick={() => handleCreateBranchOpenChange(true)}>
                    Create branch
                  </Button>
                </div>

                <Card className="border-neutral-800 bg-neutral-900">
                  <CardContent className="p-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_150px_120px_110px_36px] gap-3 border-b border-neutral-800 px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">
                      <div>Name</div>
                      <div>Parent</div>
                      <div>Created</div>
                      <div>Status</div>
                      <div />
                    </div>
                    {orderedBranchRows.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-neutral-500">
                        No branches yet.
                      </div>
                    ) : (
                      <div>
                        {orderedBranchRows.map((row) => {
                          const target = row.target;
                          const isCurrentEnvTarget =
                            envAttachment?.targetId === target.id;
                          const parentName =
                            parentNameByTargetId.get(target.id) ?? "-";
                          const resetSourceName =
                            parentNameByTargetId.get(target.id) ?? "main";
                          const isMain = target.name === "main";
                          const isResetPending =
                            pendingBranchRowAction?.targetId === target.id &&
                            pendingBranchRowAction.action === "reset";
                          const isDeletePending =
                            pendingBranchRowAction?.targetId === target.id &&
                            pendingBranchRowAction.action === "delete";
                          const isRowActionPending =
                            isResetPending || isDeletePending;
                          return (
                            <div
                              key={target.id}
                              className="grid grid-cols-[minmax(0,1fr)_150px_120px_110px_36px] gap-3 border-b border-neutral-800 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-neutral-800/30"
                            >
                              <button
                                type="button"
                                onClick={() => openBranchDrawer(target.id)}
                                className="min-w-0 text-left"
                              >
                                <div
                                  className="min-w-0"
                                  style={{ paddingLeft: `${row.depth * 20}px` }}
                                >
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-mono text-sm text-neutral-100">
                                      {target.name}
                                    </p>
                                    {target.name === "main" && (
                                      <Badge
                                        variant="outline"
                                        className="border-neutral-700 text-neutral-300"
                                      >
                                        base
                                      </Badge>
                                    )}
                                    {isCurrentEnvTarget && (
                                      <Badge
                                        variant="outline"
                                        className="border-neutral-700 text-neutral-300"
                                      >
                                        default
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => openBranchDrawer(target.id)}
                                className="truncate text-left text-sm text-neutral-400"
                              >
                                {parentName}
                              </button>
                              <button
                                type="button"
                                onClick={() => openBranchDrawer(target.id)}
                                className="text-left text-sm text-neutral-400"
                              >
                                {getTimeAgo(new Date(target.createdAt))}
                              </button>
                              <button
                                type="button"
                                onClick={() => openBranchDrawer(target.id)}
                                className="text-left"
                              >
                                <Badge
                                  variant="outline"
                                  className="border-neutral-700 text-neutral-300"
                                >
                                  {target.lifecycleStatus}
                                </Badge>
                              </button>
                              <div className="flex items-center justify-end">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-neutral-400 hover:text-neutral-200"
                                      disabled={
                                        isRowActionPending ||
                                        isAnyBranchRowActionPending
                                      }
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    <DropdownMenuItem
                                      disabled={
                                        isMain ||
                                        isRowActionPending ||
                                        isAnyBranchRowActionPending
                                      }
                                      onSelect={() => {
                                        void runBranchRowAction(
                                          target.id,
                                          "reset",
                                          async function runResetFromParent() {
                                            await handleResetTarget(
                                              target.id,
                                              resetSourceName,
                                            );
                                          },
                                        );
                                      }}
                                    >
                                      {isResetPending ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Resetting...
                                        </>
                                      ) : (
                                        "Reset from parent"
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={
                                        isMain ||
                                        isRowActionPending ||
                                        isAnyBranchRowActionPending ||
                                        isRenameBranchPending
                                      }
                                      onSelect={() =>
                                        openRenameBranchDialog(target.id)
                                      }
                                    >
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={
                                        isMain ||
                                        isRowActionPending ||
                                        isAnyBranchRowActionPending
                                      }
                                      onSelect={() => {
                                        void runBranchRowAction(
                                          target.id,
                                          "delete",
                                          async function runDeleteBranch() {
                                            await handleDeleteTarget(target.id);
                                          },
                                        );
                                      }}
                                      className="text-red-400 focus:text-red-300"
                                    >
                                      {isDeletePending ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete"
                                      )}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dialog
                  open={createBranchOpen}
                  onOpenChange={handleCreateBranchOpenChange}
                >
                  <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
                    <form onSubmit={handleCreateTargetSubmit}>
                      <DialogHeader>
                        <DialogTitle>Create branch</DialogTitle>
                        <DialogDescription>
                          Create a child branch from a parent branch.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Input
                            id="create-branch-name"
                            aria-label="Branch name"
                            value={newTargetName}
                            onChange={(event) =>
                              setNewTargetName(event.target.value)
                            }
                            placeholder="feature-1"
                            className="border-neutral-700 bg-neutral-800 text-neutral-100"
                            disabled={createTargetMutation.isPending}
                          />
                        </div>

                        {parentBranchOptions.length > 0 && (
                          <div>
                            <Select
                              value={parentBranchName}
                              onValueChange={setParentBranchName}
                              disabled={createTargetMutation.isPending}
                            >
                              <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-neutral-700 bg-neutral-800">
                                {parentBranchOptions.map((branchName) => (
                                  <SelectItem
                                    key={branchName}
                                    value={branchName}
                                    className="text-neutral-100 focus:bg-neutral-700"
                                  >
                                    {branchName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleCreateBranchOpenChange(false)}
                          disabled={createTargetMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            createTargetMutation.isPending ||
                            !newTargetName.trim() ||
                            !parentBranchName
                          }
                        >
                          {createTargetMutation.isPending ? (
                            <>
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create"
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={renameBranchOpen}
                  onOpenChange={handleRenameBranchOpenChange}
                >
                  <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
                    <form onSubmit={handleRenameBranchSubmit}>
                      <DialogHeader>
                        <DialogTitle>Rename branch</DialogTitle>
                        <DialogDescription>
                          Update the branch name.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="py-2">
                        <Input
                          aria-label="Branch name"
                          value={renameBranchName}
                          onChange={(event) =>
                            setRenameBranchName(event.target.value)
                          }
                          placeholder="new-branch-name"
                          className="border-neutral-700 bg-neutral-800 text-neutral-100"
                          disabled={isRenameBranchPending}
                        />
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRenameBranchOpenChange(false)}
                          disabled={isRenameBranchPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            isRenameBranchPending ||
                            !renameBranchTarget ||
                            !renameBranchName.trim() ||
                            renameBranchName.trim() === renameBranchTarget.name
                          }
                        >
                          {isRenameBranchPending ? (
                            <>
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              Renaming...
                            </>
                          ) : (
                            "Rename"
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="border-neutral-800 bg-neutral-900">
                  <CardContent className="space-y-3 p-4">
                    <form
                      onSubmit={handleCreateTargetSubmit}
                      className="space-y-3"
                    >
                      <div className="space-y-2">
                        <Input
                          aria-label="Instance name"
                          value={newTargetName}
                          onChange={(event) =>
                            setNewTargetName(event.target.value)
                          }
                          placeholder="instance-2"
                          className="border-neutral-700 bg-neutral-800 text-neutral-100"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={
                          createTargetMutation.isPending ||
                          !newTargetName.trim()
                        }
                      >
                        Create {runtimeUnit}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border-neutral-800 bg-neutral-900">
                  <CardContent className="space-y-3 p-4">
                    <div className="text-sm text-neutral-300">
                      Environment {runtimeUnit}:{" "}
                      {envAttachment?.targetName ?? "not attached"}
                    </div>
                    <form
                      onSubmit={handleAttachTargetSubmit}
                      className="flex flex-col gap-2 sm:flex-row"
                    >
                      <Select
                        value={selectedTargetId}
                        onValueChange={setSelectedTargetId}
                      >
                        <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100 sm:w-56">
                          <SelectValue placeholder={`Select ${runtimeUnit}`} />
                        </SelectTrigger>
                        <SelectContent className="border-neutral-700 bg-neutral-800">
                          {targets.map((target) => (
                            <SelectItem
                              key={target.id}
                              value={target.id}
                              className="text-neutral-100 focus:bg-neutral-700"
                            >
                              {target.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="submit"
                        disabled={
                          !selectedTargetId || putAttachmentMutation.isPending
                        }
                      >
                        Attach
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleDetachTarget}
                        disabled={
                          !envAttachment || deleteAttachmentMutation.isPending
                        }
                      >
                        Detach
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border-neutral-800 bg-neutral-900">
                  <CardContent className="space-y-3 p-4">
                    {targets.length === 0 ? (
                      <p className="text-sm text-neutral-500">
                        No {runtimeUnitPlural} yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {targets.map((target) => {
                          const isCurrentEnvTarget =
                            envAttachment?.targetId === target.id;
                          const attached = attachments.filter(
                            (attachment) => attachment.targetId === target.id,
                          );

                          return (
                            <button
                              type="button"
                              key={target.id}
                              onClick={() => openBranchDrawer(target.id)}
                              className="cursor-pointer rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-3 transition-colors hover:border-neutral-700"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-mono text-sm text-neutral-200">
                                      {target.name}
                                    </p>
                                    {isCurrentEnvTarget && (
                                      <Badge
                                        variant="outline"
                                        className="border-neutral-700 text-neutral-300"
                                      >
                                        current env
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                    <span>attached: {attached.length}</span>
                                    <span>
                                      created: {formatDate(target.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="border-neutral-700 text-neutral-300"
                                >
                                  {target.lifecycleStatus}
                                </Badge>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
        },
      ]
    : [];

  return (
    <>
      {database && coreSections && (
        <ResourceSidebarCore
          isOpen={!!databaseId}
          onClose={() => {
            closeBranchDrawer();
            onClose();
          }}
          title={database.name}
          icon={
            <img
              src={drawerLogoSrc}
              alt={getDatabaseLogoAlt(database.engine)}
              className="h-4 w-4 object-contain"
              onError={handleDrawerLogoError}
            />
          }
          resetKey={database.id}
          coreSections={coreSections}
          extraTabs={extraTabs}
          tabOrder={
            isPostgres
              ? ["branches", "settings"]
              : ["overview", "deployments", "logs", "settings", "branches"]
          }
          hasNestedDrawer={isBranchDrawerOpen}
        />
      )}

      {database && (
        <DatabaseBranchDrawer
          isOpen={isBranchDrawerOpen}
          onClose={closeBranchDrawer}
          databaseName={database.name}
          engine={database.engine}
          branch={selectedBranch}
          parentBranchName={selectedBranchParentName}
          defaultEnvironmentNames={selectedBranchDefaultEnvNames}
          isDefaultInCurrentEnvironment={
            !!selectedBranch && envAttachment?.targetId === selectedBranch.id
          }
          providerRef={selectedBranchProviderRef}
          onStart={async () => {
            if (!selectedBranch) {
              return;
            }
            await handleStartTarget(selectedBranch.id);
          }}
          onDeploy={async () => {
            if (!selectedBranch) {
              return;
            }
            await deployTargetMutation.mutateAsync();
            toast.success(`${runtimeUnitCapitalized} redeployed`);
          }}
          onReset={async () => {
            if (!selectedBranch) {
              return;
            }
            await handleResetTarget(
              selectedBranch.id,
              selectedBranchParentName ?? "main",
            );
          }}
          onDelete={async () => {
            if (!selectedBranch) {
              return;
            }
            await handleDeleteTarget(selectedBranch.id);
          }}
          onSetAsDefaultInEnvironment={async () => {
            if (!selectedBranch) {
              return;
            }
            await handleSetDefaultTarget(selectedBranch.id);
          }}
          onSaveSettings={handleSaveBranchSettings}
          isStartPending={startTargetMutation.isPending}
          isDeployPending={deployTargetMutation.isPending}
          isResetPending={resetTargetMutation.isPending}
          isDeletePending={deleteTargetMutation.isPending}
          isSetAsDefaultInEnvironmentPending={putAttachmentMutation.isPending}
          isSaveSettingsPending={patchTargetRuntimeSettingsMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete database"
        description={`Delete ${database?.name ?? "database"}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteDatabaseMutation.isPending}
        onConfirm={handleDeleteDatabase}
      />
    </>
  );
}
