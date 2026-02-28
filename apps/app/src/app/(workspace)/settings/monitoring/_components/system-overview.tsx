"use client";

import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import type { MetricsHistory, MonitoringSnapshot } from "@/lib/api";
import { MetricChart } from "./metric-chart";

interface SystemOverviewProps {
  snapshot: MonitoringSnapshot | undefined;
  history: MetricsHistory | undefined;
  isLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

interface GaugeProps {
  value: number;
  label: string;
  icon: React.ReactNode;
  color: string;
  detail: string;
}

function Gauge({ value, label, icon, color, detail }: GaugeProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;
  const offset = circumference - progress;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <title>{`${label} usage: ${value.toFixed(1)}%`}</title>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#262626"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-white">
            {value.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-neutral-300">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs text-neutral-500">{detail}</span>
    </div>
  );
}

export function SystemOverview({
  snapshot,
  history,
  isLoading,
}: SystemOverviewProps) {
  const system = snapshot?.system;

  const cpuData =
    history?.system.map((p) => ({
      timestamp: p.timestamp,
      value: p.cpuPercent,
    })) || [];
  const memoryData =
    history?.system.map((p) => ({
      timestamp: p.timestamp,
      value: p.memoryPercent,
    })) || [];

  if (isLoading && !system) {
    return (
      <div className="rounded-lg border border-neutral-800 p-6">
        <h2 className="text-lg font-semibold text-white">System Overview</h2>
        <div className="mt-6 flex items-center justify-center py-12 text-neutral-500">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-6">
      <h2 className="text-lg font-semibold text-white">System Overview</h2>

      <div className="mt-6 grid grid-cols-3 gap-8">
        <Gauge
          value={system?.cpuPercent || 0}
          label="CPU"
          icon={<Cpu className="h-4 w-4" />}
          color="#3b82f6"
          detail={`${system?.cpuCores || 0} cores`}
        />
        <Gauge
          value={system?.memoryPercent || 0}
          label="Memory"
          icon={<MemoryStick className="h-4 w-4" />}
          color="#a855f7"
          detail={`${formatBytes(system?.memoryUsed || 0)} / ${formatBytes(system?.memoryTotal || 0)}`}
        />
        <Gauge
          value={system?.diskPercent || 0}
          label="Disk"
          icon={<HardDrive className="h-4 w-4" />}
          color="#f59e0b"
          detail={`${formatBytes(system?.diskUsed || 0)} / ${formatBytes(system?.diskTotal || 0)}`}
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-400">
            CPU History
          </h3>
          <MetricChart data={cpuData} color="#3b82f6" label="CPU" />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-400">
            Memory History
          </h3>
          <MetricChart data={memoryData} color="#a855f7" label="Memory" />
        </div>
      </div>
    </div>
  );
}
