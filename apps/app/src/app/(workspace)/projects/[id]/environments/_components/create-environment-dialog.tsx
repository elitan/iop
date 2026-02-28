"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, FileX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { client, orpc } from "@/lib/orpc-client";

interface Environment {
  id: string;
  name: string;
  type: string;
}

interface CreateEnvironmentDialogProps {
  projectId: string;
  environments: Environment[];
  currentEnvId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEnvironmentDialog({
  projectId,
  environments,
  currentEnvId,
  open,
  onOpenChange,
}: CreateEnvironmentDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState<string>(
    currentEnvId || environments[0]?.id || "",
  );
  const [mode, setMode] = useState<"clone" | "empty">("clone");

  useEffect(() => {
    if (open) {
      setCloneFrom(currentEnvId || environments[0]?.id || "");
    }
  }, [open, currentEnvId, environments]);

  const createMutation = useMutation({
    mutationFn: () =>
      client.environments.create({
        projectId,
        name,
        type: "manual",
        cloneFromEnvironmentId: mode === "clone" ? cloneFrom : undefined,
      }),
    onSuccess: async (env) => {
      await queryClient.refetchQueries({
        queryKey: orpc.environments.list.queryOptions({ input: { projectId } })
          .queryKey,
      });
      setName("");
      setMode("clone");
      onOpenChange(false);
      router.push(`/projects/${projectId}/environments/${env.id}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      createMutation.mutate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-neutral-100">
            New Environment
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="env-name" className="text-neutral-300">
              Name
            </Label>
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="staging"
              autoFocus
              className="border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-neutral-300">Start from</Label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("clone")}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  mode === "clone"
                    ? "border-neutral-500 bg-neutral-800"
                    : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
                }`}
              >
                <Copy className="h-4 w-4 text-neutral-400" />
                <div className="flex-1">
                  <span className="text-sm text-neutral-100">
                    Clone existing
                  </span>
                  <p className="text-xs text-neutral-500">
                    Copy services and configuration
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("empty")}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  mode === "empty"
                    ? "border-neutral-500 bg-neutral-800"
                    : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
                }`}
              >
                <FileX className="h-4 w-4 text-neutral-400" />
                <div className="flex-1">
                  <span className="text-sm text-neutral-100">Empty</span>
                  <p className="text-xs text-neutral-500">
                    Start with no services
                  </p>
                </div>
              </button>
            </div>
          </div>

          {mode === "clone" && (
            <div className="grid gap-2">
              <Label className="text-neutral-300">Source environment</Label>
              <Select value={cloneFrom} onValueChange={setCloneFrom}>
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-800">
                  {environments.map((env) => (
                    <SelectItem
                      key={env.id}
                      value={env.id}
                      className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                    >
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            type="submit"
            disabled={!name.trim() || createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Creating..." : "Create Environment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
