"use client";

import { Loader2 } from "lucide-react";
import { SettingCard } from "@/components/setting-card";
import { AutoCleanupCard } from "./_components/auto-cleanup-card";
import { ImagesToKeepCard } from "./_components/images-to-keep-card";
import { PruneDanglingCard } from "./_components/prune-dangling-card";
import { PruneNetworksCard } from "./_components/prune-networks-card";
import { RunCleanupCard } from "./_components/run-cleanup-card";
import { useCleanupSettings } from "./_components/use-cleanup-settings";

export default function CleanupPage() {
  const { settings, saving, error, updateSetting, runCleanup } =
    useCleanupSettings();

  if (!settings) {
    return (
      <div className="space-y-6">
        <SettingCard
          title="Docker Cleanup"
          description="Automatically remove old images, containers, and networks."
        >
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </SettingCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoCleanupCard
        settings={settings}
        saving={saving}
        onUpdate={updateSetting}
      />
      <ImagesToKeepCard
        settings={settings}
        saving={saving}
        onUpdate={updateSetting}
      />
      <PruneDanglingCard
        settings={settings}
        saving={saving}
        onUpdate={updateSetting}
      />
      <PruneNetworksCard
        settings={settings}
        saving={saving}
        onUpdate={updateSetting}
      />
      <RunCleanupCard settings={settings} onRun={runCleanup} error={error} />
    </div>
  );
}
