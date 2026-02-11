"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { orpc } from "@/lib/orpc-client";

export function ApiKeysSection() {
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  const { data: keys = [], isLoading: loading } = useQuery(
    orpc.apiKeys.list.queryOptions(),
  );

  const createMutation = useMutation(
    orpc.apiKeys.create.mutationOptions({
      onSuccess: async (data) => {
        setNewKey({ id: data.id, key: data.key });
        setNewKeyName("");
        await queryClient.refetchQueries({ queryKey: orpc.apiKeys.list.key() });
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.apiKeys.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: orpc.apiKeys.list.key() });
      },
    }),
  );

  async function handleCreate() {
    if (demoMode) return;
    if (!newKeyName.trim()) return;
    createMutation.mutate({ name: newKeyName });
  }

  function handleDelete() {
    if (demoMode) return;
    if (!deletingKeyId) return;
    const id = deletingKeyId;
    setDeletingKeyId(null);
    deleteMutation.mutate({ id });
    if (newKey?.id === id) setNewKey(null);
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <SettingCard
      title="API Keys"
      description="Create API keys for programmatic access. Keys are shown only once."
      learnMoreUrl="/api/docs"
      learnMoreText="API documentation"
    >
      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">
          {demoMode && (
            <DemoModeAlert text="API key changes are locked in demo mode." />
          )}

          {newKey && (
            <div className="rounded-md bg-green-900/20 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-400" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-green-400">
                    API key created
                  </p>
                  <p className="text-xs text-neutral-400">
                    Copy this key now. It will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-neutral-900 px-3 py-2 font-mono text-sm text-white">
                      {newKey.key}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(newKey.key)}
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {keys.length > 0 && (
            <div className="overflow-hidden rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Key
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Created
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Last used
                    </th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-neutral-800/50">
                      <td className="px-4 py-3 text-white">{key.name}</td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-400">
                          {key.keyPrefix}...
                        </code>
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {formatDate(key.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={demoMode}
                          onClick={() => setDeletingKeyId(key.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {keys.length === 0 && !newKey && (
            <p className="text-sm text-neutral-500">
              No API keys yet. Create one to get started.
            </p>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g., CI/CD)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs"
              disabled={demoMode}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={demoMode || createMutation.isPending || !newKeyName}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create key
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deletingKeyId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingKeyId(null);
        }}
        title="Delete API key"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </SettingCard>
  );
}
