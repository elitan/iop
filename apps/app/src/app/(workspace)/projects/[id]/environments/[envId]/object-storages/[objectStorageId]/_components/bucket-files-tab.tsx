"use client";

import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateObjectStorageBucketObjectDownloadUrl,
  useDeleteObjectStorageBucketObject,
  useObjectStorageBucketObjects,
} from "@/hooks/use-object-storages";
import { BucketObjectTable } from "./bucket-object-table";
import { normalizePrefixInput } from "./bucket-object-utils";
import type { ObjectStorageBucket, ObjectStorageBucketObject } from "./types";
import { UploadBucketObjectButton } from "./upload-bucket-object-button";

interface BucketFilesTabProps {
  objectStorageId: string;
  bucket: ObjectStorageBucket;
}

function getToastErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function BucketFilesTab({
  objectStorageId,
  bucket,
}: BucketFilesTabProps) {
  const [objectPrefixInput, setObjectPrefixInput] = useState("");
  const [objectPrefix, setObjectPrefix] = useState("");
  const [objectToDelete, setObjectToDelete] =
    useState<ObjectStorageBucketObject | null>(null);
  const createDownloadUrlMutation =
    useCreateObjectStorageBucketObjectDownloadUrl(objectStorageId);
  const deleteObjectMutation =
    useDeleteObjectStorageBucketObject(objectStorageId);
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

  async function handleUploadedFile(prefix: string): Promise<void> {
    setObjectPrefix(prefix);
    await bucketObjectsQuery.refetch();
  }

  function createSignedObjectUrl(
    object: ObjectStorageBucketObject,
    disposition: "attachment" | "inline",
  ) {
    return createDownloadUrlMutation.mutateAsync({
      bucketId: bucket.id,
      key: object.key,
      disposition,
    });
  }

  async function handleDownloadObject(object: ObjectStorageBucketObject) {
    try {
      const result = await createSignedObjectUrl(object, "attachment");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(getToastErrorMessage(error, "Failed to create download URL"));
    }
  }

  async function handleCopySignedUrl(object: ObjectStorageBucketObject) {
    try {
      const result = await createSignedObjectUrl(object, "inline");
      await navigator.clipboard.writeText(result.url);
      toast.success("Signed URL copied");
    } catch (error) {
      toast.error(getToastErrorMessage(error, "Failed to copy signed URL"));
    }
  }

  async function handleCopyObjectKey(object: ObjectStorageBucketObject) {
    try {
      await navigator.clipboard.writeText(object.key);
      toast.success("Object key copied");
    } catch (error) {
      toast.error(getToastErrorMessage(error, "Failed to copy key"));
    }
  }

  async function handleConfirmDeleteObject() {
    if (!objectToDelete) {
      return;
    }

    try {
      await deleteObjectMutation.mutateAsync({
        bucketId: bucket.id,
        key: objectToDelete.key,
      });
      toast.success("File deleted");
      setObjectToDelete(null);
    } catch (error) {
      toast.error(getToastErrorMessage(error, "Failed to delete file"));
    }
  }

  const objectActionPending =
    createDownloadUrlMutation.isPending || deleteObjectMutation.isPending;

  return (
    <>
      <UploadBucketObjectButton
        objectStorageId={objectStorageId}
        bucket={bucket}
        prefixInput={objectPrefixInput}
        onUploaded={handleUploadedFile}
      />

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
        <BucketObjectTable
          objects={bucketObjects}
          actionPending={objectActionPending}
          onDownload={function handleDownload(object) {
            void handleDownloadObject(object);
          }}
          onCopySignedUrl={function handleCopySignedUrlClick(object) {
            void handleCopySignedUrl(object);
          }}
          onCopyKey={function handleCopyKeyClick(object) {
            void handleCopyObjectKey(object);
          }}
          onDelete={setObjectToDelete}
        />
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

      <ConfirmDialog
        open={objectToDelete !== null}
        onOpenChange={function handleDeleteDialogOpenChange(open) {
          if (!open && !deleteObjectMutation.isPending) {
            setObjectToDelete(null);
          }
        }}
        title="Delete file?"
        description={
          objectToDelete
            ? `This permanently deletes ${objectToDelete.key} from ${bucket.name}.`
            : "This permanently deletes the file."
        }
        confirmLabel="Delete file"
        variant="destructive"
        loading={deleteObjectMutation.isPending}
        onConfirm={function handleDeleteConfirm() {
          void handleConfirmDeleteObject();
        }}
      />
    </>
  );
}
