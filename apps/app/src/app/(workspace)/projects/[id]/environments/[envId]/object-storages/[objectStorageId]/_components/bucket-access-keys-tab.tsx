"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ObjectStorageAccessKey } from "./types";

interface BucketAccessKeysTabProps {
  accessKeys: ObjectStorageAccessKey[];
  onRevokeKey(accessKeyId: string): void;
}

export function BucketAccessKeysTab({
  accessKeys,
  onRevokeKey,
}: BucketAccessKeysTabProps) {
  return (
    <div className="divide-y divide-neutral-800">
      {accessKeys.map(function renderAccessKey(accessKey) {
        return (
          <div
            key={accessKey.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-neutral-200">
                {accessKey.name}
              </p>
              <p className="truncate font-mono text-xs text-neutral-500">
                {accessKey.accessKeyId} · {accessKey.permissions}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={function handleRevokeKey() {
                onRevokeKey(accessKey.id);
              }}
              title="Revoke key"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      {accessKeys.length === 0 && (
        <p className="py-4 text-sm text-neutral-500">
          No access keys for this bucket.
        </p>
      )}
    </div>
  );
}
