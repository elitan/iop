"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDatabase,
  useDatabaseTargets,
  useDeleteDatabase,
  useUpdateDatabase,
} from "@/hooks/use-databases";
import { DatabaseBackupSettingsPanel } from "../../../../../_components/database-backup-settings-panel";

type DatabaseSettingsTab = "general" | "backup" | "restore";

const DATABASE_SETTINGS_NAV_ITEMS: {
  id: DatabaseSettingsTab;
  label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "backup", label: "Backup" },
  { id: "restore", label: "Restore" },
];

export default function DatabaseSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);
  const deleteMutation = useDeleteDatabase(projectId);
  const updateMutation = useUpdateDatabase(databaseId, projectId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DatabaseSettingsTab>("general");
  const [name, setName] = useState("");
  const initialName = useRef("");

  useEffect(
    function syncName() {
      if (!database) {
        return;
      }
      setName(database.name);
      initialName.current = database.name;
    },
    [database],
  );

  const hasNameChanges = name.trim() !== initialName.current;

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

  async function handleSaveName() {
    if (!database) {
      return;
    }

    const nextName = name.trim();
    if (nextName.length === 0) {
      toast.error("Name is required");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        name: nextName,
      });
      setName(nextName);
      initialName.current = nextName;
      toast.success("Database name updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update database";
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
            <SettingCard
              title="Database Name"
              description="Display name for this database."
              onSubmit={handleSaveName}
              footerRight={
                <Button
                  size="sm"
                  type="submit"
                  disabled={updateMutation.isPending || !hasNameChanges}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              }
            >
              <Input
                value={name}
                onChange={function onNameChange(event) {
                  setName(event.target.value);
                }}
                placeholder="my-database"
              />
            </SettingCard>

            <SettingCard
              title="Delete Database"
              description="This removes all targets for this database."
            >
              <Button
                variant="destructive"
                onClick={function onDeleteClick() {
                  setDeleteDialogOpen(true);
                }}
                disabled={deleteMutation.isPending}
              >
                Delete database
              </Button>
            </SettingCard>
          </>
        )}

        {activeTab === "backup" && database.engine === "postgres" && (
          <DatabaseBackupSettingsPanel
            databaseId={database.id}
            targets={targets}
            mode="backup"
          />
        )}

        {activeTab === "backup" && database.engine !== "postgres" && (
          <SettingCard
            title="Backups"
            description="Backups are available for postgres databases only."
          >
            <div className="text-sm text-neutral-400">
              This database engine does not support backup settings.
            </div>
          </SettingCard>
        )}

        {activeTab === "restore" && database.engine === "postgres" && (
          <DatabaseBackupSettingsPanel
            databaseId={database.id}
            targets={targets}
            mode="restore"
          />
        )}

        {activeTab === "restore" && database.engine !== "postgres" && (
          <SettingCard
            title="Restore"
            description="Restore is available for postgres databases only."
          >
            <div className="text-sm text-neutral-400">
              This database engine does not support restore settings.
            </div>
          </SettingCard>
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
