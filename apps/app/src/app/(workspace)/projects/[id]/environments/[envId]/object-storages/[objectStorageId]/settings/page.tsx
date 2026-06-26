"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDeleteObjectStorage,
  useObjectStorage,
} from "@/hooks/use-object-storages";

export default function ObjectStorageSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const objectStorageId = params.objectStorageId as string;
  const { data } = useObjectStorage(objectStorageId);
  const deleteMutation = useDeleteObjectStorage(projectId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(objectStorageId);
      toast.success("Object storage deleted");
      setDeleteOpen(false);
      router.push(`/projects/${projectId}/environments/${envId}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete object storage",
      );
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-red-950/70 bg-red-950/10">
        <CardHeader>
          <CardTitle className="text-sm text-red-100">Delete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-400">
            This removes the object storage resource, its managed runtime,
            containers, and volumes.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={function onDeleteClick() {
              setDeleteOpen(true);
            }}
          >
            Delete object storage
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete object storage?"
        description={`Delete ${data?.objectStorage.name ?? "this object storage"} and all stored objects? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
