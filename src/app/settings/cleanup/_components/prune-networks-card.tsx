"use client";

import { SettingCard } from "@/components/setting-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CleanupSettings } from "./use-cleanup-settings";

interface PruneNetworksCardProps {
  settings: CleanupSettings;
  saving: boolean;
  onUpdate: (updates: Partial<CleanupSettings>) => void;
}

export function PruneNetworksCard({
  settings,
  saving,
  onUpdate,
}: PruneNetworksCardProps) {
  return (
    <SettingCard
      title="Prune Unused Networks"
      description="Remove Docker networks that are not used by any container. This excludes built-in networks like bridge, host, and none."
      learnMoreUrl="https://docs.docker.com/reference/cli/docker/network/prune/"
      learnMoreText="Learn more about network pruning"
    >
      <div className="flex items-center gap-3">
        <Switch
          id="prune-networks"
          checked={settings.pruneNetworks}
          onCheckedChange={(checked) => onUpdate({ pruneNetworks: checked })}
          disabled={saving}
        />
        <Label htmlFor="prune-networks" className="text-neutral-300">
          Enable unused network cleanup
        </Label>
      </div>
    </SettingCard>
  );
}
