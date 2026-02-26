"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDatabase } from "@/hooks/use-databases";

interface CreateDatabaseDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDatabaseDialog({
  projectId,
  open,
  onOpenChange,
}: CreateDatabaseDialogProps) {
  const router = useRouter();
  const createMutation = useCreateDatabase(projectId);
  const isCreating = createMutation.isPending;
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<"postgres" | "mysql">("postgres");

  async function handleCreate() {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        name: nextName,
        engine,
      });
      toast.success("Database created");
      setName("");
      setEngine("postgres");
      onOpenChange(false);
      router.push(`/projects/${projectId}/databases/${result.database.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create database";
      toast.error(message);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isCreating) {
      return;
    }
    if (!nextOpen) {
      setName("");
      setEngine("postgres");
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCreate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Database</DialogTitle>
            <DialogDescription>
              Create a database and Frost will create the main target.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="database-name">Name</Label>
              <Input
                id="database-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="app-db"
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label>Engine</Label>
              <Select
                value={engine}
                onValueChange={(value: "postgres" | "mysql") =>
                  setEngine(value)
                }
                disabled={isCreating}
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-800">
                  <SelectItem
                    value="postgres"
                    className="text-neutral-100 focus:bg-neutral-700"
                  >
                    PostgreSQL (branch targets)
                  </SelectItem>
                  <SelectItem
                    value="mysql"
                    className="text-neutral-100 focus:bg-neutral-700"
                  >
                    MySQL (instance targets)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || name.trim().length === 0}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
