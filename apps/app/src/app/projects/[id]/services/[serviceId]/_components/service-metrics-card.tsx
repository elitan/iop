"use client";

import { Activity } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceMetrics } from "@/hooks/use-monitoring";

interface ServiceMetricsCardProps {
  serviceId: string;
}

const RANGES = [
  { value: "5m", label: "5m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function ServiceMetricsCard({ serviceId }: ServiceMetricsCardProps) {
  const [range, setRange] = useState("1h");
  const { data: history } = useServiceMetrics(serviceId, range);

  const containerHistory = history?.containers
    ? Object.values(history.containers)[0] || []
    : [];

  const cpuData = containerHistory.map((p) => ({
    timestamp: p.timestamp,
    value: p.cpuPercent,
  }));

  const memoryData = containerHistory.map((p) => ({
    timestamp: p.timestamp,
    value: p.memoryPercent,
    bytes: p.memoryBytes,
  }));

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Metrics
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                type="button"
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  range === r.value
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-500">CPU</h4>
            <div className="h-20">
              {cpuData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={cpuData}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="gradient-cpu-service"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatTime}
                      tick={{ fill: "#737373", fontSize: 9 }}
                      axisLine={{ stroke: "#404040" }}
                      tickLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#737373", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        border: "1px solid #404040",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "#a3a3a3" }}
                      labelFormatter={(label) => formatTime(label as number)}
                      formatter={(value) => [
                        `${Number(value).toFixed(1)}%`,
                        "CPU",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      fill="url(#gradient-cpu-service)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded bg-neutral-900/50 text-xs text-neutral-500">
                  No data yet
                </div>
              )}
            </div>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-500">
              Memory
            </h4>
            <div className="h-20">
              {memoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={memoryData}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="gradient-memory-service"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#a855f7"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="#a855f7"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatTime}
                      tick={{ fill: "#737373", fontSize: 9 }}
                      axisLine={{ stroke: "#404040" }}
                      tickLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#737373", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        border: "1px solid #404040",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "#a3a3a3" }}
                      labelFormatter={(label) => formatTime(label as number)}
                      formatter={(value, _name, props) => {
                        const percent = `${Number(value).toFixed(1)}%`;
                        const bytes = props.payload?.bytes;
                        const label = bytes
                          ? `${percent} (${formatBytes(bytes)})`
                          : percent;
                        return [label, "Memory"];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      fill="url(#gradient-memory-service)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded bg-neutral-900/50 text-xs text-neutral-500">
                  No data yet
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
