"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { useDeleteService } from "@/hooks/use-services";

interface DangerZoneCardProps {
  serviceId: string;
  projectId: string;
  environmentId: string;
}

export function DangerZoneCard({
  serviceId,
  projectId,
  environmentId,
}: DangerZoneCardProps) {
  const router = useRouter();
  const deleteMutation = useDeleteService(environmentId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(serviceId);
      toast.success("Service deleted");
      router.push(`/projects/${projectId}/environments/${environmentId}`);
      setShowDeleteDialog(false);
    } catch {
      toast.error("Failed to delete service");
    }
  }

  return (
    <>
      <SettingCard
        variant="danger"
        title="Danger Zone"
        description="Irreversible actions for this service."
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-300">Delete Service</p>
            <p className="text-xs text-neutral-500">
              Permanently delete this service and all its deployments
            </p>
          </div>
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
            Delete Service
          </Button>
        </div>
      </SettingCard>
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete service"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}
