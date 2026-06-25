"use client";

import { FileIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObjectStorageBucket } from "./types";

interface BucketsCardProps {
  buckets: ObjectStorageBucket[];
  selectedBucketId: string;
  onSelectBucket(bucketId: string): void;
  onDeleteBucket(bucketId: string): void;
  onOpenCreateBucket(): void;
}

export function BucketsCard({
  buckets,
  selectedBucketId,
  onSelectBucket,
  onDeleteBucket,
  onOpenCreateBucket,
}: BucketsCardProps) {
  return (
    <Card className="border-neutral-800 bg-neutral-900">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm text-neutral-200">Buckets</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onOpenCreateBucket}
          >
            <Plus className="h-4 w-4" />
            New bucket
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y divide-neutral-800">
          {buckets.map(function renderBucket(bucket) {
            return (
              <div
                key={bucket.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Button
                  type="button"
                  variant={
                    bucket.id === selectedBucketId ? "secondary" : "ghost"
                  }
                  className="min-w-0 flex-1 justify-start px-2"
                  onClick={function handleSelectBucket() {
                    onSelectBucket(bucket.id);
                  }}
                  title="View files"
                >
                  <FileIcon className="h-4 w-4 text-neutral-500" />
                  <code className="truncate text-sm">{bucket.name}</code>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={function handleDeleteBucket() {
                    onDeleteBucket(bucket.id);
                  }}
                  title="Delete bucket"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {buckets.length === 0 && (
            <p className="py-4 text-sm text-neutral-500">No buckets yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
