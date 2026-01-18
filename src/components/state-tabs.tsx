"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab<T extends string> {
  id: T;
  label: string;
}

interface StateTabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
}

export function StateTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
}: StateTabsProps<T>) {
  return (
    <nav className="border-b border-neutral-800">
      <div className="flex gap-6 px-4">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative py-3 text-sm transition-colors",
              value === tab.id
                ? "text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            {tab.label}
            {value === tab.id && (
              <motion.span
                layoutId={layoutId}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-100"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
