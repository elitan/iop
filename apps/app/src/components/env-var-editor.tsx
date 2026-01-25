"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ClipboardEvent, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EnvVar {
  key: string;
  value: string;
}

interface EnvVarEditorProps {
  value: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
  managedKeys?: string[];
  onValidationChange?: (hasErrors: boolean) => void;
  managedKeySettingsUrl?: string;
}

function parseEnvContent(text: string): EnvVar[] {
  const results: EnvVar[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) results.push({ key, value: val });
  }
  return results;
}

const RESERVED_KEYS = ["PORT"];

export function EnvVarEditor({
  value,
  onChange,
  managedKeys = [],
  onValidationChange,
  managedKeySettingsUrl,
}: EnvVarEditorProps) {
  const baseId = useId();
  const reservedKeysUpper = new Set(
    [...RESERVED_KEYS, ...managedKeys].map((k) => k.toUpperCase()),
  );

  const hasErrors = value.some((v) =>
    reservedKeysUpper.has(v.key.toUpperCase()),
  );

  useEffect(() => {
    onValidationChange?.(hasErrors);
  }, [hasErrors, onValidationChange]);

  function handleAdd() {
    onChange([...value, { key: "", value: "" }]);
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleChange(index: number, field: "key" | "value", val: string) {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>, index: number) {
    const text = e.clipboardData.getData("text");
    if (text.includes("=") && text.includes("\n")) {
      e.preventDefault();
      const parsed = parseEnvContent(text);
      if (parsed.length > 0) {
        const before = value.slice(0, index);
        const after = value.slice(index + 1);
        onChange([...before, ...parsed, ...after]);
      }
    }
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex gap-2 text-xs text-muted-foreground font-medium">
          <div className="flex-1">KEY</div>
          <div className="flex-1">VALUE</div>
          <div className="w-9" />
        </div>
      )}
      {value.map((envVar, index) => {
        const id = `${baseId}-${index}`;
        const isReserved = reservedKeysUpper.has(envVar.key.toUpperCase());
        return (
          <div key={id} className="space-y-1">
            <div className="flex gap-2 group">
              <Input
                value={envVar.key}
                onChange={(e) => handleChange(index, "key", e.target.value)}
                onPaste={(e) => handlePaste(e, index)}
                className={`flex-1 font-mono text-sm ${isReserved ? "border-red-500" : ""}`}
              />
              <Input
                value={envVar.value}
                onChange={(e) => handleChange(index, "value", e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="opacity-50 hover:opacity-100"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {isReserved && (
              <p className="text-xs text-red-500">
                {envVar.key.toUpperCase()} is managed by{" "}
                {managedKeySettingsUrl ? (
                  <Link
                    href={managedKeySettingsUrl}
                    className="underline hover:text-red-400"
                  >
                    Container Port setting
                  </Link>
                ) : (
                  "Container Port setting"
                )}
              </p>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        onClick={handleAdd}
        className="h-8 px-2 text-muted-foreground"
      >
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  );
}
