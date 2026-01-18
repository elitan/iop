"use client";

import { SettingCard } from "@/components/setting-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CleanupSettings } from "./use-cleanup-settings";

interface PruneDanglingCardProps {
  settings: CleanupSettings;
  saving: boolean;
  onUpdate: (updates: Partial<CleanupSettings>) => void;
}

export function PruneDanglingCard({
  settings,
  saving,
  onUpdate,
}: PruneDanglingCardProps) {
  return (
    <SettingCard
      title="Prune Dangling Images"
      description="Remove images that are not tagged and not referenced by any container. These are typically intermediate build layers."
      learnMoreUrl="https://docs.docker.com/reference/cli/docker/image/prune/"
      learnMoreText="Learn more about image pruning"
    >
      <div className="flex items-center gap-3">
        <Switch
          id="prune-dangling"
          checked={settings.pruneDangling}
          onCheckedChange={(checked) => onUpdate({ pruneDangling: checked })}
          disabled={saving}
        />
        <Label htmlFor="prune-dangling" className="text-neutral-300">
          Enable dangling image cleanup
        </Label>
      </div>
    </SettingCard>
  );
}
