"use client";

import { useEffect, useState } from "react";

const presets = [
  { name: "Orange", color: "#f97316" },
  { name: "Ember", color: "#ea580c" },
  { name: "Tangerine", color: "#fb923c" },
  { name: "Coral", color: "#ff6b4a" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Peach", color: "#fdba74" },
  { name: "Ice", color: "#38bdf8" },
  { name: "Mint", color: "#34d399" },
  { name: "Violet", color: "#a78bfa" },
  { name: "White", color: "#ffffff" },
];

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function applyAccentColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;

  document.documentElement.style.setProperty("--color-accent", hex);
  document.documentElement.style.setProperty(
    "--color-accent-rgb",
    `${rgb.r}, ${rgb.g}, ${rgb.b}`
  );
}

export function ThemeSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeColor, setActiveColor] = useState("#f97316");

  useEffect(() => {
    applyAccentColor(activeColor);
  }, [activeColor]);

  function handlePreset(color: string) {
    setActiveColor(color);
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setActiveColor(e.target.value);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 rounded-full border border-border bg-card shadow-lg flex items-center justify-center hover:border-accent/50 transition-colors"
        style={{ boxShadow: `0 0 20px -5px ${activeColor}40` }}
      >
        <div
          className="w-6 h-6 rounded-full"
          style={{ background: activeColor }}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-16 right-0 w-64 p-4 bg-card border border-border rounded-xl shadow-xl">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Accent Color
          </div>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handlePreset(preset.color)}
                className="group relative w-8 h-8 rounded-lg border border-border hover:border-foreground/30 transition-colors flex items-center justify-center"
                title={preset.name}
              >
                <div
                  className="w-5 h-5 rounded-md"
                  style={{ background: preset.color }}
                />
                {activeColor === preset.color && (
                  <div className="absolute inset-0 border-2 border-foreground rounded-lg" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <label className="text-xs text-muted-foreground mb-2 block">
              Custom
            </label>
            <div className="relative">
              <input
                type="color"
                value={activeColor}
                onChange={handleCustomChange}
                className="w-full h-10 rounded-lg cursor-pointer bg-transparent border border-border"
                style={{ padding: 2 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
