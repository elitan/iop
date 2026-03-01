"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useDatabase,
  useDatabaseAttachments,
  useDatabaseTargets,
  useDeleteDatabaseTarget,
  useDeployDatabaseTarget,
  useEnvironmentDatabaseAttachments,
  usePatchDatabaseTargetRuntimeSettings,
  useResetDatabaseTarget,
  useStartDatabaseTarget,
} from "@/hooks/use-databases";
import {
  type BranchPanelTab,
  DatabaseBranchPanel,
  type DatabaseProviderRef,
} from "../../../../../../_components/database-branch-panel";

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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isBranchPanelTab(value: string): value is BranchPanelTab {
  return (
    value === "overview" ||
    value === "tables" ||
    value === "sql" ||
    value === "logs" ||
    value === "settings"
  );
}

function getActiveTab(pathname: string, basePath: string): BranchPanelTab {
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) {
    return "overview";
  }
  const tabCandidate = pathname.slice(prefix.length).split("/")[0];
  if (!isBranchPanelTab(tabCandidate)) {
    return "overview";
  }
  return tabCandidate;
}

function getTabPath(basePath: string, tab: BranchPanelTab): string {
  if (tab === "overview") {
    return basePath;
  }
  return `${basePath}/${tab}`;
}

export default function DatabaseBranchDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;
  const branchId = params.targetId as string;
  const branchBasePath = `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches/${branchId}`;

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);
  const { data: attachments = [] } = useDatabaseAttachments(databaseId);
  const { data: envAttachments = [] } =
    useEnvironmentDatabaseAttachments(envId);

  const startTargetMutation = useStartDatabaseTarget(databaseId);
  const deployTargetMutation = useDeployDatabaseTarget(databaseId, branchId);
  const resetTargetMutation = useResetDatabaseTarget(databaseId);
  const deleteTargetMutation = useDeleteDatabaseTarget(databaseId);
  const patchTargetRuntimeSettingsMutation =
    usePatchDatabaseTargetRuntimeSettings(databaseId, branchId);

  const branch = useMemo(
    function getSelectedBranch() {
      return targets.find((target) => target.id === branchId) ?? null;
    },
    [branchId, targets],
  );

  const parentBranchName = useMemo(
    function getParentBranchName() {
      if (!branch?.sourceTargetId) {
        return null;
      }
      return (
        targets.find((target) => target.id === branch.sourceTargetId)?.name ??
        null
      );
    },
    [branch, targets],
  );

  const parentBranchId = useMemo(
    function getParentBranchId() {
      if (!branch?.sourceTargetId) {
        return null;
      }
      const parent = targets.find(function isParentTarget(target) {
        return target.id === branch.sourceTargetId;
      });
      return parent?.id ?? null;
    },
    [branch, targets],
  );

  const branchProviderRef = useMemo(
    function getBranchProviderRef() {
      if (!branch) {
        return null;
      }
      return parseProviderRef(branch.providerRefJson);
    },
    [branch],
  );

  const defaultEnvironmentNames = useMemo(
    function getDefaultEnvironmentNames() {
      if (!branch) {
        return [];
      }
      return attachments
        .filter((attachment) => attachment.targetId === branch.id)
        .map((attachment) => attachment.environmentName);
    },
    [attachments, branch],
  );

  const envAttachment = envAttachments.find(
    (attachment) => attachment.databaseId === databaseId,
  );

  const activeTab = getActiveTab(pathname, branchBasePath);

  function handleTabChange(tab: BranchPanelTab) {
    router.push(getTabPath(branchBasePath, tab));
  }

  function goBackToBranches() {
    router.push(
      `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches`,
    );
  }

  if (!database || !branch) {
    return (
      <Card className="border-neutral-800 bg-neutral-900">
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-neutral-400">Branch not found.</p>
          <div>
            <Button variant="outline" size="sm" onClick={goBackToBranches}>
              Back to Branches
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full min-h-0">
      <DatabaseBranchPanel
        isOpen
        onClose={goBackToBranches}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        databaseId={databaseId}
        databaseName={database.name}
        engine={database.engine}
        branch={branch}
        parentBranchName={parentBranchName}
        onOpenDatabaseSettings={function onOpenDatabaseSettings() {
          router.push(
            `/projects/${projectId}/environments/${envId}/databases/${databaseId}/settings`,
          );
        }}
        onGoToParent={
          parentBranchId
            ? function onGoToParent() {
                router.push(
                  `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches/${parentBranchId}`,
                );
              }
            : undefined
        }
        defaultEnvironmentNames={defaultEnvironmentNames}
        isDefaultInCurrentEnvironment={envAttachment?.targetId === branch.id}
        providerRef={branchProviderRef}
        onStart={async function onStart() {
          try {
            await startTargetMutation.mutateAsync({ targetId: branch.id });
            toast.success("Branch started");
          } catch (error) {
            toast.error(getErrorMessage(error, "Failed to start branch"));
          }
        }}
        onDeploy={async function onDeploy() {
          try {
            await deployTargetMutation.mutateAsync();
            toast.success("Branch restarted");
          } catch (error) {
            toast.error(getErrorMessage(error, "Failed to restart branch"));
          }
        }}
        onReset={async function onReset() {
          try {
            await resetTargetMutation.mutateAsync({
              targetId: branch.id,
              sourceTargetName: parentBranchName ?? "main",
            });
            toast.success("Branch reset");
          } catch (error) {
            toast.error(getErrorMessage(error, "Failed to reset branch"));
          }
        }}
        onDelete={async function onDelete() {
          try {
            await deleteTargetMutation.mutateAsync({ targetId: branch.id });
            toast.success("Branch deleted");
            goBackToBranches();
          } catch (error) {
            toast.error(getErrorMessage(error, "Failed to delete branch"));
          }
        }}
        onSaveSettings={async function onSaveSettings(input) {
          await patchTargetRuntimeSettingsMutation.mutateAsync(input);
        }}
        isStartPending={startTargetMutation.isPending}
        isDeployPending={deployTargetMutation.isPending}
        isResetPending={resetTargetMutation.isPending}
        isDeletePending={deleteTargetMutation.isPending}
        isSaveSettingsPending={patchTargetRuntimeSettingsMutation.isPending}
      />
      {children}
    </div>
  );
}
