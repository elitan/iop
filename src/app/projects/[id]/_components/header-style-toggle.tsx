"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type HeaderStyle = "solid" | "glass" | "subtle";

interface HeaderStyleToggleProps {
  value: HeaderStyle;
  onChange: (style: HeaderStyle) => void;
}

const styles: { value: HeaderStyle; label: string; description: string }[] = [
  { value: "solid", label: "Solid", description: "bg-neutral-900" },
  { value: "glass", label: "Glass", description: "bg-neutral-900/80 + blur" },
  {
    value: "subtle",
    label: "Subtle",
    description: "bg-neutral-900/50 + border",
  },
];

export function HeaderStyleToggle({ value, onChange }: HeaderStyleToggleProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="mb-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-2 text-xs font-medium text-neutral-400">
            Header Style
          </div>
          <div className="flex flex-col gap-1">
            {styles.map((style) => (
              <button
                type="button"
                key={style.value}
                onClick={() => onChange(style.value)}
                className={cn(
                  "flex flex-col items-start rounded px-3 py-2 text-left transition-colors",
                  value === style.value
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200",
                )}
              >
                <span className="text-sm font-medium">{style.label}</span>
                <span className="text-xs text-neutral-500">
                  {style.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-colors",
          isOpen
            ? "border-neutral-600 bg-neutral-800 text-neutral-100"
            : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200",
        )}
      >
        {isOpen ? "Close" : "Toggle Header Style"}
      </button>
    </div>
  );
}

export function getHeaderStyleClasses(style: HeaderStyle): string {
  switch (style) {
    case "solid":
      return "bg-neutral-900";
    case "glass":
      return "bg-neutral-900/80 backdrop-blur-sm";
    case "subtle":
      return "bg-neutral-900/50";
  }
}

export function getHeaderBorderClasses(style: HeaderStyle): string {
  if (style === "subtle") {
    return "border-b border-neutral-700";
  }
  return "";
}
