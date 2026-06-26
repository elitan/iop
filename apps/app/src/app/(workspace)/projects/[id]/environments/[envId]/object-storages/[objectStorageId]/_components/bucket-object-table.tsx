"use client";

import { FileIcon } from "lucide-react";
import { BucketObjectActionsMenu } from "./bucket-object-actions-menu";
import { formatObjectDate, formatObjectSize } from "./bucket-object-utils";
import type { ObjectStorageBucketObject } from "./types";

interface BucketObjectTableProps {
  objects: ObjectStorageBucketObject[];
  actionPending: boolean;
  onDownload(object: ObjectStorageBucketObject): void;
  onCopySignedUrl(object: ObjectStorageBucketObject): void;
  onCopyKey(object: ObjectStorageBucketObject): void;
  onDelete(object: ObjectStorageBucketObject): void;
}

export function BucketObjectTable({
  objects,
  actionPending,
  onDownload,
  onCopySignedUrl,
  onCopyKey,
  onDelete,
}: BucketObjectTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.25rem] gap-3 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-500 md:grid-cols-[minmax(0,1fr)_7rem_10rem_2.25rem]">
        <span>Key</span>
        <span className="text-right">Size</span>
        <span className="hidden md:block">Modified</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="divide-y divide-neutral-800">
        {objects.map(function renderObject(object) {
          return (
            <div
              key={object.key}
              className="grid grid-cols-[minmax(0,1fr)_5rem_2.25rem] items-center gap-3 px-3 py-2 md:grid-cols-[minmax(0,1fr)_7rem_10rem_2.25rem]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon className="h-4 w-4 shrink-0 text-neutral-500" />
                <code className="truncate text-xs text-neutral-200">
                  {object.key}
                </code>
              </div>
              <span className="text-right text-xs text-neutral-400">
                {formatObjectSize(object.size)}
              </span>
              <span className="hidden truncate text-xs text-neutral-500 md:block">
                {formatObjectDate(object.lastModified)}
              </span>
              <div className="flex justify-end">
                <BucketObjectActionsMenu
                  object={object}
                  pending={actionPending}
                  onDownload={onDownload}
                  onCopySignedUrl={onCopySignedUrl}
                  onCopyKey={onCopyKey}
                  onDelete={onDelete}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
