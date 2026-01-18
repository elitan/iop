"use client";

import { useState } from "react";
import {
  useMonitoringHistory,
  useMonitoringStats,
} from "@/hooks/use-monitoring";
import { SystemOverview } from "./_components/system-overview";
import { TimeRangeSelector } from "./_components/time-range-selector";

export default function MonitoringPage() {
  const [range, setRange] = useState("1h");
  const { data: snapshot, isLoading: statsLoading } = useMonitoringStats();
  const { data: history, isLoading: historyLoading } =
    useMonitoringHistory(range);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Monitoring</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Real-time system metrics
          </p>
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      <SystemOverview
        snapshot={snapshot}
        history={history}
        isLoading={statsLoading || historyLoading}
      />
    </div>
  );
}
