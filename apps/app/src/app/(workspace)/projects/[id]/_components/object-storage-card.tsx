"use client";

import { Archive } from "lucide-react";
import Link from "next/link";
import { ServiceRuntimeIndicator } from "@/components/service-runtime-indicator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ContractOutputs } from "@/contracts";

type ObjectStorage = ContractOutputs["objectStorages"]["list"][number];

interface ObjectStorageCardProps {
  objectStorage: ObjectStorage;
  projectId: string;
}

export function ObjectStorageCard({
  objectStorage,
  projectId,
}: ObjectStorageCardProps) {
  return (
    <Link
      href={`/projects/${projectId}/environments/${objectStorage.environmentId}/object-storages/${objectStorage.id}`}
      className="h-full"
    >
      <Card className="h-full cursor-pointer border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700">
        <CardContent className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
              <Archive className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-neutral-200">
                  {objectStorage.name}
                </p>
                <ServiceRuntimeIndicator
                  runtimeStatus={objectStorage.runtimeStatus}
                  attentionStatus={objectStorage.attentionStatus}
                  className="shrink-0"
                />
              </div>
              <p className="truncate text-xs text-neutral-500">
                {objectStorage.endpoint ?? objectStorage.internalEndpoint}
              </p>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-neutral-700 text-neutral-300"
            >
              S3 API
            </Badge>
            <Badge
              variant="outline"
              className="border-neutral-700 text-neutral-300"
            >
              {objectStorage.region}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
