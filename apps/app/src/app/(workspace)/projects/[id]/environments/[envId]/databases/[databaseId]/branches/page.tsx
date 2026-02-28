"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  useDatabaseAttachments,
  useDatabaseTargets,
  useDeleteDatabaseTarget,
  useDeleteEnvironmentDatabaseAttachment,
  useEnvironmentDatabaseAttachments,
  usePutEnvironmentDatabaseAttachment,
  useResetDatabaseTarget,
  useStartDatabaseTarget,
  useStopDatabaseTarget,
} from "@/hooks/use-databases";

function formatDate(value: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function DatabaseBranchesPage() {
  const params = useParams();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);
  const { data: attachments = [] } = useDatabaseAttachments(databaseId);
  const { data: envAttachments = [] } =
    useEnvironmentDatabaseAttachments(envId);

  const createTargetMutation = useCreateDatabaseTarget(databaseId, projectId);
  const resetTargetMutation = useResetDatabaseTarget(databaseId);
  const startTargetMutation = useStartDatabaseTarget(databaseId);
  const stopTargetMutation = useStopDatabaseTarget(databaseId);
  const deleteTargetMutation = useDeleteDatabaseTarget(databaseId);
  const putAttachmentMutation = usePutEnvironmentDatabaseAttachment(
    envId,
    databaseId,
  );
  const deleteAttachmentMutation = useDeleteEnvironmentDatabaseAttachment(
    envId,
    databaseId,
  );

  const [newTargetName, setNewTargetName] = useState("");
  const [sourceTargetName, setSourceTargetName] = useState("main");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");

  const sourceOptions = useMemo(
    () => targets.map((target) => ({ id: target.id, name: target.name })),
    [targets],
  );

  const envAttachment = envAttachments.find(
    (attachment) => attachment.databaseId === databaseId,
  );

  async function handleCreateTarget() {
    const name = newTargetName.trim();
    if (!name) return;

    try {
      await createTargetMutation.mutateAsync({
        name,
        sourceTargetName:
          database?.engine === "postgres" ? sourceTargetName : undefined,
      });
      setNewTargetName("");
      toast.success("Target created");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create target";
      toast.error(message);
    }
  }

  async function handleStartTarget(targetId: string) {
    try {
      await startTargetMutation.mutateAsync({ targetId });
      toast.success("Target started");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start target";
      toast.error(message);
    }
  }

  async function handleStopTarget(targetId: string) {
    try {
      await stopTargetMutation.mutateAsync({ targetId });
      toast.success("Target stopped");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop target";
      toast.error(message);
    }
  }

  async function handleResetTarget(targetId: string) {
    try {
      await resetTargetMutation.mutateAsync({
        targetId,
        sourceTargetName,
      });
      toast.success("Target reset");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset target";
      toast.error(message);
    }
  }

  async function handleDeleteTarget(targetId: string) {
    try {
      await deleteTargetMutation.mutateAsync({ targetId });
      toast.success("Target deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete target";
      toast.error(message);
    }
  }

  async function handleAttachTarget() {
    if (!envId || !selectedTargetId) return;

    try {
      await putAttachmentMutation.mutateAsync({
        targetId: selectedTargetId,
        mode: "manual",
      });
      toast.success("Environment attachment updated");
      setSelectedTargetId("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update attachment";
      toast.error(message);
    }
  }

  async function handleDetachTarget() {
    if (!envId) return;

    try {
      await deleteAttachmentMutation.mutateAsync();
      toast.success("Environment detached");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to detach";
      toast.error(message);
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

  if (!database) {
    return null;
  }

  return (
    <div className="space-y-4">
      {envId && (
        <Card className="border-neutral-800 bg-neutral-900">
          <CardHeader>
            <CardTitle className="text-base text-neutral-100">
              Environment Attachment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-neutral-300">
              {envAttachment
                ? `Current target: ${envAttachment.targetName} (${envAttachment.mode})`
                : "No target attached for this environment"}
            </div>
            <form
              onSubmit={handleAttachTargetSubmit}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Select
                value={selectedTargetId}
                onValueChange={setSelectedTargetId}
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100 sm:w-64">
                  <SelectValue placeholder="Select target" />
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
                disabled={!selectedTargetId || putAttachmentMutation.isPending}
              >
                Attach
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDetachTarget}
                disabled={!envAttachment || deleteAttachmentMutation.isPending}
              >
                Detach
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-base text-neutral-100">
            Create {database.engine === "postgres" ? "Branch" : "Instance"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleCreateTargetSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newTargetName}
                  onChange={(event) => setNewTargetName(event.target.value)}
                  placeholder={
                    database.engine === "postgres" ? "dev" : "staging"
                  }
                  className="border-neutral-700 bg-neutral-800 text-neutral-100"
                />
              </div>

              {database.engine === "postgres" && (
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={sourceTargetName}
                    onValueChange={setSourceTargetName}
                  >
                    <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-700 bg-neutral-800">
                      {sourceOptions.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.name}
                          className="text-neutral-100 focus:bg-neutral-700"
                        >
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={!newTargetName.trim() || createTargetMutation.isPending}
            >
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-base text-neutral-100">
            {database.engine === "postgres" ? "Branches" : "Instances"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {targets.length === 0 ? (
            <p className="text-sm text-neutral-500">No targets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 pr-4 font-medium">Attached envs</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((target) => {
                    const source = targets.find(
                      (item) => item.id === target.sourceTargetId,
                    );
                    const attached = attachments.filter(
                      (attachment) => attachment.targetId === target.id,
                    );

                    return (
                      <tr
                        key={target.id}
                        className="border-b border-neutral-900 align-top"
                      >
                        <td className="py-3 pr-4 font-mono text-neutral-200">
                          <Link
                            href={`/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches/${target.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {target.name}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant="outline"
                            className="border-neutral-700 text-neutral-300"
                          >
                            {target.lifecycleStatus}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-neutral-400">
                          {source?.name ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-neutral-400">
                          {attached.length === 0
                            ? "-"
                            : attached
                                .map((attachment) => attachment.environmentName)
                                .join(", ")}
                        </td>
                        <td className="py-3 pr-4 text-neutral-400">
                          {formatDate(target.createdAt)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {target.lifecycleStatus === "active" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStopTarget(target.id)}
                                disabled={stopTargetMutation.isPending}
                              >
                                Stop
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartTarget(target.id)}
                                disabled={startTargetMutation.isPending}
                              >
                                Start
                              </Button>
                            )}

                            {database.engine === "postgres" &&
                              target.name !== "main" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResetTarget(target.id)}
                                  disabled={resetTargetMutation.isPending}
                                >
                                  Reset
                                </Button>
                              )}

                            {target.name !== "main" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTarget(target.id)}
                                disabled={deleteTargetMutation.isPending}
                                className="text-red-400 hover:text-red-300"
                              >
                                Delete
                              </Button>
                            )}
                          </div>
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
    </div>
  );
}
