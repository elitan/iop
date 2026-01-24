"use client";

import { File, Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export interface StagedService {
  id: string;
  name: string;
  dockerfilePath: string;
  buildContext: string;
  containerPort: number;
  enabled: boolean;
}

interface StagedServicesListProps {
  services: StagedService[];
  onChange: (services: StagedService[]) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isLoading?: boolean;
}

export function StagedServicesList({
  services,
  onChange,
  onCancel,
  onSubmit,
  isLoading,
}: StagedServicesListProps): React.ReactElement {
  const enabledCount = services.filter((s) => s.enabled).length;

  function updateService(id: string, updates: Partial<StagedService>): void {
    onChange(services.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  function toggleAll(enabled: boolean): void {
    onChange(services.map((s) => ({ ...s, enabled })));
  }

  const duplicates = new Set(
    services
      .filter((s) => s.enabled)
      .map((s) => s.name)
      .filter((name, i, arr) => arr.indexOf(name) !== i),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          {services.length} Dockerfile{services.length !== 1 ? "s" : ""} found
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleAll(false)}
            disabled={enabledCount === 0}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <Minus className="mr-1 h-3 w-3" />
            None
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleAll(true)}
            disabled={enabledCount === services.length}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <Plus className="mr-1 h-3 w-3" />
            All
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {services.map((service) => {
          const isDuplicate = service.enabled && duplicates.has(service.name);
          return (
            <div
              key={service.id}
              className={`rounded-lg border p-3 transition-colors ${
                service.enabled
                  ? "border-neutral-700 bg-neutral-800"
                  : "border-neutral-800 bg-neutral-900 opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <Switch
                  checked={service.enabled}
                  onCheckedChange={(enabled) =>
                    updateService(service.id, { enabled })
                  }
                  className="mt-1"
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={service.name}
                      onChange={(e) =>
                        updateService(service.id, { name: e.target.value })
                      }
                      disabled={!service.enabled}
                      className={`h-8 border-neutral-700 bg-neutral-900 text-sm ${
                        isDuplicate ? "border-red-500" : ""
                      }`}
                      placeholder="Service name"
                    />
                    <Input
                      type="number"
                      value={service.containerPort}
                      onChange={(e) =>
                        updateService(service.id, {
                          containerPort: parseInt(e.target.value, 10) || 8080,
                        })
                      }
                      disabled={!service.enabled}
                      className="h-8 w-20 border-neutral-700 bg-neutral-900 text-sm"
                      placeholder="Port"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <File className="h-3 w-3" />
                    <span className="font-mono">{service.dockerfilePath}</span>
                  </div>

                  {isDuplicate && (
                    <p className="text-xs text-red-400">
                      Duplicate name - will be auto-suffixed
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={enabledCount === 0 || isLoading}
          className="flex-1"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            `Create ${enabledCount} Service${enabledCount !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}
