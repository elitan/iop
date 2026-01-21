"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/orpc-client";

interface DeleteEnvironmentDialogProps {
  environmentId: string;
  environmentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteEnvironmentDialog({
  environmentId,
  environmentName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteEnvironmentDialogProps) {
  const [confirmation, setConfirmation] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => client.environments.delete({ id: environmentId }),
    onSuccess: () => {
      onOpenChange(false);
      onDeleted();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmation === environmentName) {
      deleteMutation.mutate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              This will permanently delete the environment and all its services,
              deployments, and data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="confirmation">
                Type <strong>{environmentName}</strong> to confirm
              </Label>
              <Input
                id="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={environmentName}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                confirmation !== environmentName || deleteMutation.isPending
              }
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Environment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
