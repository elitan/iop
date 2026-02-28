"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DataPoint {
  timestamp: number;
  value: number;
}

interface MetricChartProps {
  data: DataPoint[];
  color: string;
  label: string;
  unit?: string;
  height?: number;
}

function formatTime(label: unknown): string {
  const date = new Date(Number(label));
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MetricChart({
  data,
  color,
  label,
  unit = "%",
  height = 120,
}: MetricChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-neutral-900/50 text-neutral-500"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
        >
          <defs>
            <linearGradient
              id={`gradient-${label}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTime}
            tick={{ fill: "#737373", fontSize: 10 }}
            axisLine={{ stroke: "#404040" }}
            tickLine={false}
            minTickGap={50}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#737373", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#171717",
              border: "1px solid #404040",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#a3a3a3" }}
            labelFormatter={(label) => formatTime(label as number)}
            formatter={(value) => [`${Number(value).toFixed(1)}${unit}`, label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${label})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
