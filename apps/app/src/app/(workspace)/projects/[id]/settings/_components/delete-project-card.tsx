"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { useDeleteProject } from "@/hooks/use-projects";

interface DeleteProjectCardProps {
  projectId: string;
}

export function DeleteProjectCard({ projectId }: DeleteProjectCardProps) {
  const router = useRouter();
  const deleteMutation = useDeleteProject();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(projectId);
      toast.success("Project deleted");
      router.push("/");
      setShowDeleteDialog(false);
    } catch {
      toast.error("Failed to delete project");
    }
  }

  return (
    <>
      <SettingCard
        variant="danger"
        title="Delete Project"
        description="Permanently delete this project and all its services, deployments, and environment variables. This action cannot be undone."
        footerRight={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete Project
          </Button>
        }
      >
        <p className="text-sm text-neutral-400">
          Once deleted, this project and all associated data will be permanently
          removed from Frost.
        </p>
      </SettingCard>
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete project"
        description="Delete this project and all its services? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}
