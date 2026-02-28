"use client";

const RANGES = [
  { value: "5m", label: "5m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "14d", label: "14d" },
];

interface TimeRangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <button
          type="button"
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === range.value
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
