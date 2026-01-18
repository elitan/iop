"use client";

import { SettingCard } from "@/components/setting-card";
import { Input } from "@/components/ui/input";
import type { CleanupSettings } from "./use-cleanup-settings";

interface ImagesToKeepCardProps {
  settings: CleanupSettings;
  saving: boolean;
  onUpdate: (updates: Partial<CleanupSettings>) => void;
}

export function ImagesToKeepCard({
  settings,
  saving,
  onUpdate,
}: ImagesToKeepCardProps) {
  return (
    <SettingCard
      title="Images to Keep"
      description="Number of Docker images to retain per service. Older images beyond this limit will be deleted during cleanup."
      footerLeft={
        <span className="text-sm text-neutral-500">
          Valid range: 1-10 images
        </span>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={10}
          value={settings.keepImages}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val >= 1 && val <= 10) {
              onUpdate({ keepImages: val });
            }
          }}
          disabled={saving}
          className="w-24"
        />
        <span className="text-sm text-neutral-500">images per service</span>
      </div>
    </SettingCard>
  );
}
