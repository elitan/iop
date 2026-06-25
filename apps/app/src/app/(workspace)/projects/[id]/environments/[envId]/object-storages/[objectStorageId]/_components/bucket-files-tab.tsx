"use client";

import { FileIcon, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useObjectStorageBucketObjects } from "@/hooks/use-object-storages";
import { CopyButton } from "./copy-field";
import type { ObjectStorageBucket } from "./types";

interface BucketFilesTabProps {
  objectStorageId: string;
  bucket: ObjectStorageBucket;
}

function formatObjectSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const unit = units[unitIndex] ?? "TB";
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

function formatObjectDate(timestamp: number | null): string {
  if (timestamp === null) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function normalizePrefixInput(prefix: string): string {
  return prefix.trim().replace(/^\/+/, "");
}

export function BucketFilesTab({
  objectStorageId,
  bucket,
}: BucketFilesTabProps) {
  const [objectPrefixInput, setObjectPrefixInput] = useState("");
  const [objectPrefix, setObjectPrefix] = useState("");
  const bucketObjectsQuery = useObjectStorageBucketObjects({
    objectStorageId,
    bucketId: bucket.id,
    prefix: objectPrefix,
  });
  const bucketObjects =
    bucketObjectsQuery.data?.pages.flatMap(function getPageObjects(page) {
      return page.objects;
    }) ?? [];

  function handleObjectPrefixSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setObjectPrefix(normalizePrefixInput(objectPrefixInput));
  }

  return (
    <>
      <form
        onSubmit={handleObjectPrefixSubmit}
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_6rem_2.25rem]"
      >
        <Label htmlFor="object_storage_object_prefix" className="sr-only">
          Prefix
        </Label>
        <Input
          id="object_storage_object_prefix"
          value={objectPrefixInput}
          onChange={function handleObjectPrefixInputChange(event) {
            setObjectPrefixInput(event.target.value);
          }}
          placeholder="uploads/"
          className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100"
        />
        <Button type="submit" variant="secondary" className="w-full">
          <Search className="h-4 w-4" />
          Filter
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={bucketObjectsQuery.isFetching}
          onClick={function handleRefreshObjects() {
            void bucketObjectsQuery.refetch();
          }}
          title="Refresh files"
        >
          {bucketObjectsQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </form>

      {bucketObjectsQuery.isError && (
        <p className="rounded-md border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-200">
          {bucketObjectsQuery.error instanceof Error
            ? bucketObjectsQuery.error.message
            : "Failed to load files"}
        </p>
      )}

      {bucketObjectsQuery.isLoading && !bucketObjectsQuery.data && (
        <div className="flex items-center gap-2 py-4 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files
        </div>
      )}

      {!bucketObjectsQuery.isLoading &&
        bucketObjects.length === 0 &&
        !bucketObjectsQuery.isError && (
          <p className="py-4 text-sm text-neutral-500">No files found.</p>
        )}

      {bucketObjects.length > 0 && (
        <div className="overflow-hidden rounded-md border border-neutral-800">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] gap-3 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-500 md:grid-cols-[minmax(0,1fr)_7rem_10rem_2rem]">
            <span>Key</span>
            <span className="text-right">Size</span>
            <span className="hidden md:block">Modified</span>
            <span className="sr-only">Copy</span>
          </div>
          <div className="divide-y divide-neutral-800">
            {bucketObjects.map(function renderObject(object) {
              return (
                <div
                  key={object.key}
                  className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-3 px-3 py-2 md:grid-cols-[minmax(0,1fr)_7rem_10rem_2rem]"
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
                  <CopyButton value={object.key} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {bucketObjectsQuery.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={bucketObjectsQuery.isFetchingNextPage}
          onClick={function handleLoadMoreObjects() {
            void bucketObjectsQuery.fetchNextPage();
          }}
        >
          {bucketObjectsQuery.isFetchingNextPage ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Load more
        </Button>
      )}
    </>
  );
}
