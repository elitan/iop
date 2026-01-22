"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { useService } from "@/hooks/use-services";
import { slugify } from "@/lib/slugify";

interface HostnameCardProps {
  serviceId: string;
}

export function HostnameCard({ serviceId }: HostnameCardProps) {
  const { data: service } = useService(serviceId);
  const [copied, setCopied] = useState(false);

  if (!service) return null;

  const hostname = service.hostname ?? slugify(service.name);

  async function handleCopy() {
    await navigator.clipboard.writeText(hostname);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingCard
      title="Hostname"
      description="Used for inter-service communication within the project network."
    >
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-200">
          {hostname}
        </code>
        <Button variant="outline" size="icon" onClick={handleCopy}>
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </SettingCard>
  );
}
