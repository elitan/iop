"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import {
  useDatabase,
  useDatabaseTargets,
  useDeleteDatabase,
} from "@/hooks/use-databases";
import { DatabaseBackupSettingsPanel } from "../../../../../_components/database-backup-settings-panel";

type DatabaseSettingsTab = "general";

const DATABASE_SETTINGS_NAV_ITEMS: {
  id: DatabaseSettingsTab;
  label: string;
}[] = [{ id: "general", label: "General" }];

export default function DatabaseSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);
  const deleteMutation = useDeleteDatabase(projectId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DatabaseSettingsTab>("general");

  async function handleDelete() {
    if (!database) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(database.id);
      toast.success("Database deleted");
      router.push(`/projects/${projectId}/environments/${envId}`);
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
    <div className="flex gap-6">
      <nav className="sticky top-0 self-start w-32 shrink-0 space-y-0.5">
        {DATABASE_SETTINGS_NAV_ITEMS.map(function renderNavItem(item) {
          const isActive = activeTab === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={function onNavClick() {
                setActiveTab(item.id);
              }}
              className={
                isActive
                  ? "block w-full rounded-md bg-neutral-800/80 px-3 py-2 text-left text-sm text-white"
                  : "block w-full rounded-md px-3 py-2 text-left text-sm text-neutral-400 transition-colors hover:text-neutral-200"
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 space-y-6">
        {activeTab === "general" && (
          <>
            {database.engine === "postgres" && (
              <DatabaseBackupSettingsPanel
                databaseId={database.id}
                targets={targets}
              />
            )}

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
          </>
        )}
      </div>

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
