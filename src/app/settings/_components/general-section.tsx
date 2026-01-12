"use client";

import { useEffect, useState } from "react";
import { SettingCard } from "@/components/setting-card";

interface GeneralInfo {
  currentVersion: string;
}

export function GeneralSection() {
  const [info, setInfo] = useState<GeneralInfo | null>(null);

  useEffect(() => {
    fetch("/api/updates")
      .then((res) => res.json())
      .then((data) => setInfo({ currentVersion: data.currentVersion }))
      .catch(() => {});
  }, []);

  return (
    <SettingCard
      title="General"
      description="Basic information about your Frost instance."
    >
      <div>
        <p className="text-sm text-neutral-400">Version</p>
        <p className="font-mono text-neutral-100">
          {info?.currentVersion ? `v${info.currentVersion}` : "..."}
        </p>
      </div>
    </SettingCard>
  );
}
