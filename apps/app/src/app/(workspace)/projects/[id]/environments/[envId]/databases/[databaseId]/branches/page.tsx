"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, GitBranchPlus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateDatabaseTarget,
  useDatabase,
  useDatabaseTargets,
  useDeleteDatabaseTarget,
  useResetDatabaseTarget,
} from "@/hooks/use-databases";
import { orpc } from "@/lib/orpc-client";

type HierarchyTarget = {
  id: string;
  name: string;
  sourceTargetId: string | null;
};

function formatDate(value: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function compareTargetNames(a: HierarchyTarget, b: HierarchyTarget): number {
  if (a.name === "main") return -1;
  if (b.name === "main") return 1;
  return a.name.localeCompare(b.name);
}

function getHierarchyOrder(targets: HierarchyTarget[]): Array<{
  id: string;
  depth: number;
}> {
  const byId = new Map(
    targets.map(function toEntry(target) {
      return [target.id, target];
    }),
  );
  const childrenByParent = new Map<string, HierarchyTarget[]>();
  const roots: HierarchyTarget[] = [];

  for (const target of targets) {
    if (!target.sourceTargetId || !byId.has(target.sourceTargetId)) {
      roots.push(target);
      continue;
    }
    const children = childrenByParent.get(target.sourceTargetId) ?? [];
    children.push(target);
    childrenByParent.set(target.sourceTargetId, children);
  }

  roots.sort(compareTargetNames);
  for (const children of childrenByParent.values()) {
    children.sort(compareTargetNames);
  }

  const ordered: Array<{ id: string; depth: number }> = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(target: HierarchyTarget, depth: number) {
    if (visited.has(target.id) || visiting.has(target.id)) {
      return;
    }
    visiting.add(target.id);
    ordered.push({ id: target.id, depth });
    visited.add(target.id);
    const children = childrenByParent.get(target.id) ?? [];
    for (const child of children) {
      visit(child, depth + 1);
    }
    visiting.delete(target.id);
  }

  for (const root of roots) {
    visit(root, 0);
  }

  for (const target of [...targets].sort(compareTargetNames)) {
    if (!visited.has(target.id)) {
      visit(target, 0);
    }
  }

  return ordered;
}

export default function DatabaseBranchesPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);

  const createTargetMutation = useCreateDatabaseTarget(databaseId, projectId);
  const resetTargetMutation = useResetDatabaseTarget(databaseId);
  const deleteTargetMutation = useDeleteDatabaseTarget(databaseId);

  const renameTargetMutation = useMutation({
    mutationFn: function mutationFn(input: { targetId: string; name: string }) {
      return orpc.databases.patchTargetRuntimeSettings.call({
        databaseId,
        targetId: input.targetId,
        name: input.name,
      });
    },
    onSuccess: async function onSuccess() {
      await queryClient.refetchQueries({
        queryKey: orpc.databases.listTargets.key({ input: { databaseId } }),
      });
    },
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTargetName, setNewTargetName] = useState("");
  const [sourceTargetName, setSourceTargetName] = useState("");
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const targetById = useMemo(
    function getTargetById() {
      return new Map(
        targets.map(function toEntry(target) {
          return [target.id, target];
        }),
      );
    },
    [targets],
  );

  const rows = useMemo(
    function getRows() {
      const hierarchy = getHierarchyOrder(targets);
      const nextRows: Array<{
        target: (typeof targets)[number];
        depth: number;
        parentName: string | null;
      }> = [];
      for (const item of hierarchy) {
        const target = targetById.get(item.id);
        if (!target) {
          continue;
        }
        const parentName = target.sourceTargetId
          ? (targetById.get(target.sourceTargetId)?.name ?? null)
          : null;
        nextRows.push({
          target,
          depth: item.depth,
          parentName,
        });
      }
      return nextRows;
    },
    [targetById, targets],
  );

  const renameTarget = renameTargetId ? targetById.get(renameTargetId) : null;
  const resetTarget = resetTargetId ? targetById.get(resetTargetId) : null;
  const deleteTarget = deleteTargetId ? targetById.get(deleteTargetId) : null;
  const resetParentName =
    resetTarget?.sourceTargetId &&
    targetById.get(resetTarget.sourceTargetId)?.name
      ? targetById.get(resetTarget.sourceTargetId)?.name
      : null;

  const sourceOptions = useMemo(
    function getSourceOptions() {
      return targets.map(function toSource(target) {
        return { id: target.id, name: target.name };
      });
    },
    [targets],
  );

  const unitLabel = database?.engine === "postgres" ? "branch" : "instance";
  const unitLabelTitle =
    database?.engine === "postgres" ? "Branch" : "Instance";
  const unitListTitle =
    database?.engine === "postgres"
      ? `${rows.length} ${rows.length === 1 ? "Branch" : "Branches"}`
      : `${rows.length} ${rows.length === 1 ? "Instance" : "Instances"}`;

  function openCreateDialog() {
    const mainTarget = targets.find(function isMainTarget(target) {
      return target.name === "main";
    });
    setSourceTargetName(mainTarget?.name ?? targets[0]?.name ?? "");
    setNewTargetName("");
    setCreateDialogOpen(true);
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = newTargetName.trim();
    if (!nextName) {
      return;
    }

    try {
      await createTargetMutation.mutateAsync({
        name: nextName,
        sourceTargetName:
          database?.engine === "postgres" ? sourceTargetName : undefined,
      });
      setCreateDialogOpen(false);
      setNewTargetName("");
      toast.success(`${unitLabelTitle} created`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to create ${unitLabel}`;
      toast.error(message);
    }
  }

  function openRenameDialog(targetId: string, targetName: string) {
    setRenameTargetId(targetId);
    setRenameValue(targetName);
  }

  async function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) {
      return;
    }
    const nextName = renameValue.trim();
    if (!nextName) {
      return;
    }

    try {
      await renameTargetMutation.mutateAsync({
        targetId: renameTarget.id,
        name: nextName,
      });
      setRenameTargetId(null);
      setRenameValue("");
      toast.success(`${unitLabelTitle} renamed`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to rename ${unitLabel}`;
      toast.error(message);
    }
  }

  async function handleResetConfirm() {
    if (!resetTarget || !resetParentName) {
      return;
    }

    try {
      await resetTargetMutation.mutateAsync({
        targetId: resetTarget.id,
        sourceTargetName: resetParentName,
      });
      setResetTargetId(null);
      toast.success(`${unitLabelTitle} reset`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to reset ${unitLabel}`;
      toast.error(message);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteTargetMutation.mutateAsync({ targetId: deleteTarget.id });
      setDeleteTargetId(null);
      toast.success(`${unitLabelTitle} deleted`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to delete ${unitLabel}`;
      toast.error(message);
    }
  }

  function openBranchPage(targetId: string) {
    router.push(
      `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches/${targetId}`,
    );
  }

  if (!database) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base text-neutral-100">
            {unitListTitle}
          </CardTitle>
          <Button onClick={openCreateDialog} size="sm">
            <GitBranchPlus className="h-4 w-4" />
            New {unitLabelTitle}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-5 text-sm text-neutral-500">
              No {unitLabel}s yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Parent</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(function renderRow(row) {
                    const canReset =
                      row.target.name !== "main" && row.parentName !== null;
                    const canDelete = row.target.name !== "main";
                    return (
                      <tr
                        key={row.target.id}
                        className="cursor-pointer border-b border-neutral-800/70 align-top transition-colors duration-150 hover:bg-neutral-800/55 focus-visible:bg-neutral-800/45"
                        onClick={function onRowClick() {
                          openBranchPage(row.target.id);
                        }}
                        onKeyDown={function onRowKeyDown(event) {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openBranchPage(row.target.id);
                          }
                        }}
                        tabIndex={0}
                      >
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-2"
                            style={{ paddingLeft: `${row.depth * 18}px` }}
                          >
                            {row.depth > 0 && (
                              <span className="text-xs text-neutral-600">
                                ↳
                              </span>
                            )}
                            <span className="font-mono text-neutral-200">
                              {row.target.name}
                            </span>
                            {row.target.name === "main" && (
                              <Badge
                                variant="outline"
                                className="border-neutral-700 text-[10px] uppercase text-neutral-400"
                              >
                                default
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-400">
                          {row.parentName ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className="border-neutral-700 text-neutral-300"
                          >
                            {row.target.lifecycleStatus}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-neutral-400">
                          {formatDate(row.target.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-neutral-400 hover:text-neutral-100"
                                onClick={function onMenuTriggerClick(event) {
                                  event.stopPropagation();
                                }}
                                onKeyDown={function onMenuTriggerKeyDown(
                                  event,
                                ) {
                                  event.stopPropagation();
                                }}
                              >
                                <EllipsisVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={function onRename() {
                                  openRenameDialog(
                                    row.target.id,
                                    row.target.name,
                                  );
                                }}
                                disabled={row.target.name === "main"}
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={function onReset() {
                                  setResetTargetId(row.target.id);
                                }}
                                disabled={!canReset}
                              >
                                Reset to parent
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={function onDelete() {
                                  setDeleteTargetId(row.target.id);
                                }}
                                disabled={!canDelete}
                                className="text-red-400 focus:text-red-300"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">
              New {unitLabelTitle}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target_name">Name</Label>
              <Input
                id="target_name"
                name="target_name"
                value={newTargetName}
                onChange={function onTargetNameChange(event) {
                  setNewTargetName(event.target.value);
                }}
                placeholder={
                  database.engine === "postgres" ? "feature-branch" : "staging"
                }
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
                autoFocus
              />
            </div>

            {database.engine === "postgres" && (
              <div className="space-y-2">
                <Label>Parent</Label>
                <Select
                  value={sourceTargetName}
                  onValueChange={setSourceTargetName}
                >
                  <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                    <SelectValue placeholder="Select parent branch" />
                  </SelectTrigger>
                  <SelectContent className="border-neutral-700 bg-neutral-800">
                    {sourceOptions.map(function renderSourceOption(option) {
                      return (
                        <SelectItem
                          key={option.id}
                          value={option.name}
                          className="text-neutral-100 focus:bg-neutral-700"
                        >
                          {option.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-neutral-700 text-neutral-300"
                onClick={function onCloseCreateDialog() {
                  setCreateDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createTargetMutation.isPending ||
                  newTargetName.trim().length === 0 ||
                  (database.engine === "postgres" &&
                    sourceTargetName.trim().length === 0)
                }
              >
                {createTargetMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={function onRenameDialogOpenChange(open) {
          if (!open) {
            setRenameTargetId(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">
              Rename {unitLabel}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename_target_name">Name</Label>
              <Input
                id="rename_target_name"
                name="rename_target_name"
                value={renameValue}
                onChange={function onRenameValueChange(event) {
                  setRenameValue(event.target.value);
                }}
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-neutral-700 text-neutral-300"
                onClick={function onCancelRename() {
                  setRenameTargetId(null);
                  setRenameValue("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  renameTargetMutation.isPending ||
                  renameValue.trim().length === 0 ||
                  renameValue.trim() === (renameTarget?.name ?? "")
                }
              >
                {renameTargetMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={function onResetDialogOpenChange(open) {
          if (!open) {
            setResetTargetId(null);
          }
        }}
        title={`Reset ${unitLabel}`}
        description={
          resetTarget && resetParentName
            ? `Reset ${resetTarget.name} to parent ${resetParentName}?`
            : `Reset this ${unitLabel} to parent?`
        }
        confirmLabel="Reset"
        variant="destructive"
        loading={resetTargetMutation.isPending}
        onConfirm={handleResetConfirm}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={function onDeleteDialogOpenChange(open) {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title={`Delete ${unitLabel}`}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This cannot be undone.`
            : `Delete this ${unitLabel}? This cannot be undone.`
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteTargetMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
