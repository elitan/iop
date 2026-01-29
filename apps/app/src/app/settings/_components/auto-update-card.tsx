"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingCard } from "@/components/setting-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc-client";

function utcToLocalHour(utcHour: number): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.getHours();
}

function localToUtcHour(localHour: number): number {
  const d = new Date();
  d.setHours(localHour, 0, 0, 0);
  return d.getUTCHours();
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}

export function AutoUpdateCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery(orpc.updates.getAutoUpdate.queryOptions());

  const mutation = useMutation(
    orpc.updates.updateAutoUpdate.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({
          queryKey: orpc.updates.getAutoUpdate.key(),
        });
      },
    }),
  );

  const enabled = data?.enabled ?? true;
  const utcHour = data?.hour ?? 4;
  const localHour = utcToLocalHour(utcHour);

  function handleToggle(checked: boolean) {
    mutation.mutate({ enabled: checked });
  }

  function handleHourChange(value: string) {
    const newLocalHour = Number.parseInt(value, 10);
    mutation.mutate({ hour: localToUtcHour(newLocalHour) });
  }

  return (
    <SettingCard
      title="Auto Update"
      description="Automatically check for and apply updates daily at a scheduled time."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label
            htmlFor="auto-update-toggle"
            className="text-sm text-neutral-300"
          >
            Enable auto updates
          </label>
          <Switch
            id="auto-update-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {enabled && (
          <div className="flex items-center justify-between">
            <label
              htmlFor="auto-update-hour"
              className="text-sm text-neutral-300"
            >
              Update hour
            </label>
            <Select
              value={localHour.toString()}
              onValueChange={handleHourChange}
            >
              <SelectTrigger id="auto-update-hour" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h.toString()}>
                    {formatHour(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </SettingCard>
  );
}
