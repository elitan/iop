"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeployService,
  useService,
  useServiceVolumes,
  useUpdateService,
} from "@/hooks/use-services";
import type { VolumeConfig } from "@/lib/api";

function pathToVolumeName(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, "-");
}

interface VolumesCardProps {
  serviceId: string;
  projectId: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function VolumesCard({ serviceId, projectId }: VolumesCardProps) {
  const { data: service } = useService(serviceId);
  const { data: volumeInfo } = useServiceVolumes(serviceId);
  const updateMutation = useUpdateService(serviceId, projectId);
  const deployMutation = useDeployService(serviceId, projectId);

  const [volumes, setVolumes] = useState<VolumeConfig[]>([]);
  const [newPath, setNewPath] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const initialVolumes = useRef<VolumeConfig[]>([]);

  useEffect(() => {
    if (service?.volumes) {
      try {
        const parsed = JSON.parse(service.volumes) as VolumeConfig[];
        setVolumes(parsed);
        initialVolumes.current = parsed;
      } catch {
        setVolumes([]);
        initialVolumes.current = [];
      }
    } else {
      setVolumes([]);
      initialVolumes.current = [];
    }
  }, [service?.volumes]);

  const hasChanges =
    JSON.stringify(volumes) !== JSON.stringify(initialVolumes.current);

  function handleAddVolume() {
    if (!newPath.startsWith("/")) {
      toast.error("Mount path must start with /");
      return;
    }
    if (volumes.some((v) => v.path === newPath)) {
      toast.error("Volume with this path already exists");
      return;
    }
    const name = pathToVolumeName(newPath);
    setVolumes([...volumes, { name, path: newPath }]);
    setNewPath("");
    setIsAdding(false);
  }

  function handleRemoveVolume(path: string) {
    setVolumes(volumes.filter((v) => v.path !== path));
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({ volumes });
      initialVolumes.current = volumes;
      toast.success("Volumes saved", {
        description: "Redeploy required for changes to take effect",
        duration: 10000,
        action: {
          label: "Redeploy",
          onClick: () => deployMutation.mutateAsync(),
        },
      });
    } catch {
      toast.error("Failed to save");
    }
  }

  if (!service) return null;

  const sizeMap = new Map(volumeInfo?.map((v) => [v.path, v.sizeBytes]) ?? []);

  return (
    <SettingCard
      title="Volumes"
      description="Persistent storage that survives redeployments. Data is stored on the host machine."
      footerLeft={
        <span className="text-sm text-neutral-500">
          Adding/removing volumes requires redeploy
        </span>
      }
      footerRight={
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending || !hasChanges}
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      }
    >
      <div className="space-y-4">
        {volumes.length > 0 && (
          <div className="rounded border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400">
                  <th className="px-3 py-2 font-medium">Mount Path</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol) => (
                  <tr
                    key={vol.path}
                    className="border-b border-neutral-800 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-neutral-200">
                      {vol.path}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {formatBytes(sizeMap.get(vol.path) ?? null)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveVolume(vol.path)}
                        className="text-neutral-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isAdding ? (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/data"
              className="max-w-xs font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddVolume();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewPath("");
                }
              }}
            />
            <Button size="sm" variant="secondary" onClick={handleAddVolume}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewPath("");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Volume
          </Button>
        )}
      </div>
    </SettingCard>
  );
}
