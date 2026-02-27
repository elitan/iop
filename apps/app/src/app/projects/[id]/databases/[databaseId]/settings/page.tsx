"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDatabase, useDeleteDatabase } from "@/hooks/use-databases";
import { normalizeDatabaseProvider } from "@/lib/database-provider";

export default function DatabaseSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const databaseId = params.databaseId as string;

  const { data: database } = useDatabase(databaseId);
  const deleteMutation = useDeleteDatabase(projectId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function handleDelete() {
    if (!database) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(database.id);
      toast.success("Database deleted");
      router.push(`/projects/${projectId}/databases`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete database";
      toast.error(message);
    }
  }

  if (!database) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SettingCard
        title="Database"
        description="Engine and provider for this database"
      >
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className="border-neutral-700 text-neutral-300"
          >
            {database.engine}
          </Badge>
          <Badge
            variant="outline"
            className="border-neutral-700 text-neutral-300"
          >
            {normalizeDatabaseProvider(database.provider)}
          </Badge>
        </div>
      </SettingCard>

      <SettingCard
        title="Delete Database"
        description="This removes all targets, attachments, and bindings for this database."
      >
        <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleteMutation.isPending}
        >
          Delete database
        </Button>
      </SettingCard>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Database"
        description={`Delete ${database.name}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
