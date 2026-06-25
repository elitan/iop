"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BucketAccessKeysTab } from "./bucket-access-keys-tab";
import { BucketFilesTab } from "./bucket-files-tab";
import type { ObjectStorageAccessKey, ObjectStorageBucket } from "./types";

type BucketPanelTab = "files" | "access-keys";

interface SelectedBucketPanelProps {
  objectStorageId: string;
  bucket: ObjectStorageBucket | null;
  accessKeys: ObjectStorageAccessKey[];
  onOpenCreateKey(): void;
  onRevokeKey(accessKeyId: string): void;
}

export function SelectedBucketPanel({
  objectStorageId,
  bucket,
  accessKeys,
  onOpenCreateKey,
  onRevokeKey,
}: SelectedBucketPanelProps) {
  const [tab, setTab] = useState<BucketPanelTab>("files");

  function handleTabChange(value: string) {
    if (value === "files" || value === "access-keys") {
      setTab(value);
    }
  }

  return (
    <Card className="border-neutral-800 bg-neutral-900">
      <CardHeader>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm text-neutral-200">Bucket</CardTitle>
            {bucket ? (
              <code className="block truncate text-xs text-neutral-500">
                {bucket.name}
              </code>
            ) : (
              <p className="text-xs text-neutral-500">No bucket selected</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!bucket ? (
          <p className="py-4 text-sm text-neutral-500">
            Select a bucket to view files and keys.
          </p>
        ) : (
          <Tabs
            value={tab}
            onValueChange={handleTabChange}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="border border-neutral-800 bg-neutral-950">
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="access-keys">Access keys</TabsTrigger>
              </TabsList>
              {tab === "access-keys" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onOpenCreateKey}
                >
                  <KeyRound className="h-4 w-4" />
                  New key
                </Button>
              )}
            </div>

            <TabsContent value="files" className="space-y-3">
              <BucketFilesTab
                objectStorageId={objectStorageId}
                bucket={bucket}
              />
            </TabsContent>

            <TabsContent value="access-keys" className="space-y-3">
              <BucketAccessKeysTab
                accessKeys={accessKeys}
                onRevokeKey={onRevokeKey}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
