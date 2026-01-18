"use client";

import { useEffect, useRef, useState } from "react";

export interface CleanupResult {
  success: boolean;
  deletedImages: string[];
  deletedNetworks: string[];
  prunedContainers: number;
  freedBytes: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

export interface CleanupSettings {
  enabled: boolean;
  keepImages: number;
  pruneDangling: boolean;
  pruneNetworks: boolean;
  running: boolean;
  lastRun: string | null;
  lastResult: CleanupResult | null;
}

export function useCleanupSettings() {
  const [settings, setSettings] = useState<CleanupSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/cleanup")
      .then((res) => res.json())
      .then(setSettings)
      .catch(() => setError("Failed to load cleanup settings"));
  }, []);

  useEffect(() => {
    if (!settings?.running) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/cleanup/run");
        const data = await res.json();
        if (!data.running) {
          setSettings((s) =>
            s
              ? {
                  ...s,
                  running: false,
                  lastRun: data.lastRun,
                  lastResult: data.result,
                }
              : s,
          );
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [settings?.running]);

  async function updateSetting(updates: Partial<CleanupSettings>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setSettings(data);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function runCleanup() {
    setError("");
    try {
      const res = await fetch("/api/cleanup/run", { method: "POST" });
      if (res.status === 409) {
        setError("Cleanup already running");
        return;
      }
      setSettings((s) => (s ? { ...s, running: true } : s));
    } catch {
      setError("Failed to start cleanup");
    }
  }

  return {
    settings,
    saving,
    error,
    updateSetting,
    runCleanup,
  };
}
