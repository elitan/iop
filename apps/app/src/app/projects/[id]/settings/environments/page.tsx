"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client, orpc } from "@/lib/orpc-client";

export default function EnvironmentsSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();

  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );

  const [editingEnv, setEditingEnv] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newName, setNewName] = useState("");

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string }) =>
      client.environments.update(data),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.environments.list.queryOptions({ input: { projectId } })
          .queryKey,
      });
      setEditingEnv(null);
      setNewName("");
      toast.success("Environment renamed");
    },
    onError: () => {
      toast.error("Failed to rename environment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.environments.delete({ id }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.environments.list.queryOptions({ input: { projectId } })
          .queryKey,
      });
      setDeletingEnv(null);
      toast.success("Environment deleted");
    },
    onError: () => {
      toast.error("Failed to delete environment");
    },
  });

  function handleEditClick(env: { id: string; name: string }) {
    setEditingEnv(env);
    setNewName(env.name);
  }

  function handleRename() {
    if (!editingEnv || !newName.trim()) return;
    updateMutation.mutate({ id: editingEnv.id, name: newName.trim() });
  }

  function handleDelete() {
    if (!deletingEnv) return;
    deleteMutation.mutate(deletingEnv.id);
  }

  const canDelete = environments.length > 1;

  return (
    <div className="space-y-6">
      <SettingCard
        title="Environments"
        description="Manage your project environments. Each environment has isolated services and configuration."
      >
        <div className="space-y-2">
          {environments.map((env) => (
            <div
              key={env.id}
              className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/50 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-100">{env.name}</span>
                {env.type === "production" && (
                  <Badge variant="default" className="text-xs">
                    production
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditClick(env)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {canDelete && env.type !== "production" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingEnv(env)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingCard>

      <Dialog
        open={editingEnv !== null}
        onOpenChange={(open) => !open && setEditingEnv(null)}
      >
        <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Environment</DialogTitle>
            <DialogDescription>
              Change the display name for this environment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="env-name" className="text-neutral-300">
                Name
              </Label>
              <Input
                id="env-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="staging"
                autoFocus
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingEnv(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={
                !newName.trim() ||
                newName === editingEnv?.name ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingEnv !== null}
        onOpenChange={(open) => !open && setDeletingEnv(null)}
        title="Delete Environment"
        description={`Are you sure you want to delete "${deletingEnv?.name}"? This will stop and remove all services in this environment. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
