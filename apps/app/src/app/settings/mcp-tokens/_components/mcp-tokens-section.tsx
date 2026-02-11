"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { orpc } from "@/lib/orpc-client";

export function McpTokensSection() {
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tokens = [], isLoading: loading } = useQuery(
    orpc.mcpTokens.list.queryOptions(),
  );

  const deleteMutation = useMutation(
    orpc.mcpTokens.delete.mutationOptions({
      onSuccess: async () => {
        setDeleteId(null);
        await queryClient.refetchQueries({
          queryKey: orpc.mcpTokens.list.key(),
        });
      },
    }),
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <SettingCard
      title="MCP Tokens"
      description="Manage access tokens for MCP clients."
      learnMoreUrl="/docs/guides/mcp"
      learnMoreText="MCP docs"
    >
      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {demoMode && (
            <DemoModeAlert text="MCP token changes are locked in demo mode." />
          )}

          {tokens.length === 0 && (
            <p className="text-sm text-neutral-500">No active tokens.</p>
          )}

          {tokens.length > 0 && (
            <div className="overflow-hidden rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Client Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Created
                    </th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr
                      key={token.id}
                      className="border-b border-neutral-800/50"
                    >
                      <td className="px-4 py-3 text-white">
                        {token.clientName ?? "Unknown client"}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {formatDate(token.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={demoMode}
                          onClick={() => setDeleteId(token.id)}
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
        </>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Revoke token"
        description="This will immediately disconnect the MCP client using this token. This cannot be undone."
        confirmLabel="Revoke"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (demoMode) return;
          if (deleteId) deleteMutation.mutate({ id: deleteId });
        }}
      />
    </SettingCard>
  );
}
