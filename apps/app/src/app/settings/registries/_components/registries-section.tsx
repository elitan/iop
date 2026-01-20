"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc-client";

const REGISTRY_TYPES = [
  { value: "ghcr", label: "GitHub Container Registry", url: "ghcr.io" },
  { value: "dockerhub", label: "Docker Hub", url: "docker.io" },
  { value: "custom", label: "Custom Registry", url: null },
] as const;

export function RegistriesSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "ghcr" as "ghcr" | "dockerhub" | "custom",
    url: "",
    username: "",
    password: "",
  });

  const { data: registries = [], isLoading: loading } = useQuery(
    orpc.registries.list.queryOptions(),
  );

  const createMutation = useMutation(
    orpc.registries.create.mutationOptions({
      onSuccess: async () => {
        setFormData({
          name: "",
          type: "ghcr",
          url: "",
          username: "",
          password: "",
        });
        setShowForm(false);
        await queryClient.refetchQueries({
          queryKey: orpc.registries.list.key(),
        });
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to create registry",
        );
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.registries.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({
          queryKey: orpc.registries.list.key(),
        });
      },
      onError: (err) => {
        alert(err instanceof Error ? err.message : "Failed to delete registry");
      },
    }),
  );

  async function handleCreate() {
    if (
      !formData.name.trim() ||
      !formData.username.trim() ||
      !formData.password.trim()
    ) {
      setError("Name, username, and password are required");
      return;
    }
    if (formData.type === "custom" && !formData.url.trim()) {
      setError("URL is required for custom registries");
      return;
    }

    setError(null);
    createMutation.mutate({
      name: formData.name,
      type: formData.type,
      url: formData.type === "custom" ? formData.url : undefined,
      username: formData.username,
      password: formData.password,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this registry?")) return;
    deleteMutation.mutate({ id });
  }

  function getRegistryUrl(registry: {
    type: string;
    url: string | null;
  }): string {
    if (registry.type === "custom" && registry.url) return registry.url;
    const type = REGISTRY_TYPES.find((t) => t.value === registry.type);
    return type?.url || registry.type;
  }

  return (
    <SettingCard
      title="Container Registries"
      description="Configure credentials for private Docker registries like GHCR or Docker Hub."
    >
      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">
          {registries.length > 0 && (
            <div className="overflow-hidden rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      URL
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-neutral-400">
                      Username
                    </th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {registries.map((registry) => (
                    <tr
                      key={registry.id}
                      className="border-b border-neutral-800/50"
                    >
                      <td className="px-4 py-3 text-white">{registry.name}</td>
                      <td className="px-4 py-3 text-neutral-400">
                        {REGISTRY_TYPES.find((t) => t.value === registry.type)
                          ?.label || registry.type}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-400">
                          {getRegistryUrl(registry)}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {registry.username}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(registry.id)}
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

          {registries.length === 0 && !showForm && (
            <p className="text-sm text-neutral-500">
              No registries configured. Add one to pull from private
              repositories.
            </p>
          )}

          {showForm ? (
            <div className="space-y-4 rounded-md border border-neutral-800 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="reg-name"
                    className="text-sm text-neutral-400"
                  >
                    Name
                  </label>
                  <Input
                    id="reg-name"
                    placeholder="My Registry"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="reg-type"
                    className="text-sm text-neutral-400"
                  >
                    Type
                  </label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: "ghcr" | "dockerhub" | "custom") =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger id="reg-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGISTRY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.type === "custom" && (
                <div className="space-y-2">
                  <label htmlFor="reg-url" className="text-sm text-neutral-400">
                    Registry URL
                  </label>
                  <Input
                    id="reg-url"
                    placeholder="registry.example.com"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="reg-username"
                    className="text-sm text-neutral-400"
                  >
                    Username
                  </label>
                  <Input
                    id="reg-username"
                    placeholder="username"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="reg-password"
                    className="text-sm text-neutral-400"
                  >
                    Password / Token
                  </label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add Registry
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Registry
            </Button>
          )}
        </div>
      )}
    </SettingCard>
  );
}
