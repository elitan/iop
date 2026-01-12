"use client";

import { SettingCard } from "@/components/setting-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CleanupSettings } from "./use-cleanup-settings";

interface AutoCleanupCardProps {
  settings: CleanupSettings;
  saving: boolean;
  onUpdate: (updates: Partial<CleanupSettings>) => void;
}

export function AutoCleanupCard({
  settings,
  saving,
  onUpdate,
}: AutoCleanupCardProps) {
  return (
    <SettingCard
      title="Automatic Cleanup"
      description="Schedule automatic cleanup to run daily at 3:00 AM. This removes old images, stopped containers, and unused networks."
    >
      <div className="flex items-center gap-3">
        <Switch
          id="cleanup-enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => onUpdate({ enabled: checked })}
          disabled={saving}
        />
        <Label htmlFor="cleanup-enabled" className="text-neutral-300">
          Enable automatic cleanup
        </Label>
      </div>
    </SettingCard>
  );
}
