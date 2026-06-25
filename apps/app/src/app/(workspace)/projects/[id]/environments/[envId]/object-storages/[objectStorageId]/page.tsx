"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCreateObjectStorageAccessKey,
  useCreateObjectStorageBucket,
  useDeleteObjectStorageBucket,
  useObjectStorage,
  useRevokeObjectStorageAccessKey,
} from "@/hooks/use-object-storages";
import { BucketsCard } from "./_components/buckets-card";
import { ObjectStorageConnectionCard } from "./_components/connection-card";
import { CreatedKeyCard } from "./_components/created-key-card";
import {
  CreateAccessKeyDialog,
  CreateBucketDialog,
} from "./_components/object-storage-dialogs";
import { SelectedBucketPanel } from "./_components/selected-bucket-panel";
import type {
  AccessKeyPermission,
  CreatedAccessKey,
} from "./_components/types";

export default function ObjectStorageOverviewPage() {
  const params = useParams();
  const objectStorageId = params.objectStorageId as string;
  const { data, isLoading } = useObjectStorage(objectStorageId);
  const createBucketMutation = useCreateObjectStorageBucket(objectStorageId);
  const deleteBucketMutation = useDeleteObjectStorageBucket(objectStorageId);
  const createKeyMutation = useCreateObjectStorageAccessKey(objectStorageId);
  const revokeKeyMutation = useRevokeObjectStorageAccessKey(objectStorageId);
  const [selectedBucketId, setSelectedBucketId] = useState("");
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedAccessKey | null>(null);
  const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);

  const activeBuckets = useMemo(
    function getActiveBuckets() {
      return data?.buckets ?? [];
    },
    [data?.buckets],
  );
  const selectedBucket = useMemo(
    function getSelectedBucket() {
      return (
        activeBuckets.find(function findBucket(bucket) {
          return bucket.id === selectedBucketId;
        }) ?? null
      );
    },
    [activeBuckets, selectedBucketId],
  );
  const selectedBucketAccessKeys = useMemo(
    function getSelectedBucketAccessKeys() {
      const accessKeys = data?.accessKeys ?? [];
      if (!selectedBucket) {
        return [];
      }

      return accessKeys.filter(function isActiveSelectedBucketKey(accessKey) {
        return (
          accessKey.revokedAt === null &&
          accessKey.bucketId === selectedBucket.id
        );
      });
    },
    [data?.accessKeys, selectedBucket],
  );

  useEffect(
    function syncSelectedBucket() {
      const selectedStillExists = activeBuckets.some(
        function hasSelectedBucket(bucket) {
          return bucket.id === selectedBucketId;
        },
      );

      if (selectedStillExists) {
        return;
      }

      const nextSelectedBucketId = activeBuckets[0]?.id ?? "";
      if (selectedBucketId !== nextSelectedBucketId) {
        setSelectedBucketId(nextSelectedBucketId);
      }
    },
    [activeBuckets, selectedBucketId],
  );

  async function handleCreateBucket(name: string): Promise<boolean> {
    try {
      const bucket = await createBucketMutation.mutateAsync({ name });
      setSelectedBucketId(bucket.id);
      toast.success("Bucket created");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create bucket",
      );
      return false;
    }
  }

  async function handleDeleteBucket() {
    if (!bucketToDelete) {
      return;
    }

    try {
      await deleteBucketMutation.mutateAsync(bucketToDelete);
      if (bucketToDelete === selectedBucketId) {
        setSelectedBucketId("");
      }
      setBucketToDelete(null);
      toast.success("Bucket deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete bucket",
      );
    }
  }

  async function handleCreateKey(input: {
    name: string;
    permissions: AccessKeyPermission;
  }): Promise<boolean> {
    if (!selectedBucket) {
      return false;
    }

    try {
      const result = await createKeyMutation.mutateAsync({
        bucketId: selectedBucket.id,
        name: input.name,
        permissions: input.permissions,
      });
      setCreatedKey(result);
      toast.success("Access key created");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create access key",
      );
      return false;
    }
  }

  async function handleRevokeKey() {
    if (!keyToRevoke) {
      return;
    }

    try {
      await revokeKeyMutation.mutateAsync(keyToRevoke);
      setKeyToRevoke(null);
      toast.success("Access key revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke access key",
      );
    }
  }

  if (isLoading || !data) {
    return (
      <Card className="border-neutral-800 bg-neutral-900">
        <CardContent className="py-10 text-center text-sm text-neutral-400">
          Loading object storage...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ObjectStorageConnectionCard connection={data.connection} />

      {createdKey && <CreatedKeyCard createdKey={createdKey} />}

      <BucketsCard
        buckets={activeBuckets}
        selectedBucketId={selectedBucket?.id ?? ""}
        onSelectBucket={setSelectedBucketId}
        onDeleteBucket={setBucketToDelete}
        onOpenCreateBucket={function handleOpenCreateBucket() {
          setCreateBucketOpen(true);
        }}
      />

      <SelectedBucketPanel
        key={selectedBucket?.id ?? "no-bucket"}
        objectStorageId={objectStorageId}
        bucket={selectedBucket}
        accessKeys={selectedBucketAccessKeys}
        onOpenCreateKey={function handleOpenCreateKey() {
          setCreateKeyOpen(true);
        }}
        onRevokeKey={setKeyToRevoke}
      />

      <CreateBucketDialog
        open={createBucketOpen}
        pending={createBucketMutation.isPending}
        onOpenChange={setCreateBucketOpen}
        onCreateBucket={handleCreateBucket}
      />

      <CreateAccessKeyDialog
        open={createKeyOpen}
        pending={createKeyMutation.isPending}
        bucketName={selectedBucket?.name ?? null}
        disabled={!selectedBucket}
        onOpenChange={setCreateKeyOpen}
        onCreateKey={handleCreateKey}
      />

      <ConfirmDialog
        open={bucketToDelete !== null}
        onOpenChange={function handleBucketDialogOpenChange(open) {
          if (!open) {
            setBucketToDelete(null);
          }
        }}
        title="Delete bucket?"
        description="A bucket can only be deleted when it is empty. This removes the bucket from Frost object storage."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteBucketMutation.isPending}
        onConfirm={handleDeleteBucket}
      />

      <ConfirmDialog
        open={keyToRevoke !== null}
        onOpenChange={function handleKeyDialogOpenChange(open) {
          if (!open) {
            setKeyToRevoke(null);
          }
        }}
        title="Revoke access key?"
        description="This key will stop working for S3 API requests."
        confirmLabel="Revoke"
        variant="destructive"
        loading={revokeKeyMutation.isPending}
        onConfirm={handleRevokeKey}
      />
    </div>
  );
}
