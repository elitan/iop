"use client";

import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContractOutputs } from "@/contracts";
import {
  useCreateObjectStorageAccessKey,
  useCreateObjectStorageBucket,
  useDeleteObjectStorageBucket,
  useObjectStorage,
  useRevokeObjectStorageAccessKey,
} from "@/hooks/use-object-storages";

type AccessKeyResult = ContractOutputs["objectStorages"]["createAccessKey"];

function CopyButton({ value }: { value: string }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleCopy}
      title="Copy"
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-800 py-2 last:border-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="truncate text-xs text-neutral-200">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function buildEnvBlock(snippets: AccessKeyResult["snippets"]): string {
  return snippets.env
    .map(function formatEnv(envVar) {
      return `${envVar.key}=${envVar.value}`;
    })
    .join("\n");
}

export default function ObjectStorageOverviewPage() {
  const params = useParams();
  const objectStorageId = params.objectStorageId as string;
  const { data, isLoading } = useObjectStorage(objectStorageId);
  const createBucketMutation = useCreateObjectStorageBucket(objectStorageId);
  const deleteBucketMutation = useDeleteObjectStorageBucket(objectStorageId);
  const createKeyMutation = useCreateObjectStorageAccessKey(objectStorageId);
  const revokeKeyMutation = useRevokeObjectStorageAccessKey(objectStorageId);
  const [bucketName, setBucketName] = useState("");
  const [keyName, setKeyName] = useState("app");
  const [selectedBucketId, setSelectedBucketId] = useState("");
  const [permissions, setPermissions] = useState<
    "read-only" | "read-write" | "full"
  >("read-write");
  const [createdKey, setCreatedKey] = useState<AccessKeyResult | null>(null);
  const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);

  const activeBuckets = data?.buckets ?? [];
  const activeKeys = (data?.accessKeys ?? []).filter(function activeKey(key) {
    return key.revokedAt === null;
  });

  const externalEndpoint = data?.connection.endpoint ?? null;

  const defaultBucketId = useMemo(
    function getDefaultBucketId() {
      return selectedBucketId || activeBuckets[0]?.id || "";
    },
    [activeBuckets, selectedBucketId],
  );

  async function handleCreateBucket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bucketName.trim()) {
      return;
    }

    try {
      await createBucketMutation.mutateAsync({ name: bucketName.trim() });
      setBucketName("");
      toast.success("Bucket created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create bucket",
      );
    }
  }

  async function handleDeleteBucket() {
    if (!bucketToDelete) {
      return;
    }

    try {
      await deleteBucketMutation.mutateAsync(bucketToDelete);
      setBucketToDelete(null);
      toast.success("Bucket deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete bucket",
      );
    }
  }

  async function handleCreateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!defaultBucketId || !keyName.trim()) {
      return;
    }

    try {
      const result = await createKeyMutation.mutateAsync({
        bucketId: defaultBucketId,
        name: keyName.trim(),
        permissions,
      });
      setCreatedKey(result);
      setKeyName("app");
      toast.success("Access key created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create access key",
      );
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
      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-sm text-neutral-200">
            S3 Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <SettingRow
            label="External endpoint"
            value={externalEndpoint ?? "Deploying"}
          />
          <SettingRow
            label="Internal endpoint"
            value={data.connection.internalEndpoint}
          />
          <SettingRow label="Region" value={data.connection.region} />
          <SettingRow label="Force path style" value="true" />
        </CardContent>
      </Card>

      {createdKey && (
        <Card className="border-emerald-800/70 bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-emerald-100">
              Secret shown once
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SettingRow
              label="Access key"
              value={createdKey.accessKey.accessKeyId}
            />
            <SettingRow label="Secret key" value={createdKey.secretAccessKey} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-400">Environment</p>
                <CopyButton value={buildEnvBlock(createdKey.snippets)} />
              </div>
              <pre className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
                {buildEnvBlock(createdKey.snippets)}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-400">AWS CLI</p>
                <CopyButton value={createdKey.snippets.awsCli} />
              </div>
              <pre className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
                {createdKey.snippets.awsCli}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-sm text-neutral-200">Buckets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleCreateBucket} className="flex gap-2">
            <Label htmlFor="object_storage_bucket_name" className="sr-only">
              Bucket name
            </Label>
            <Input
              id="object_storage_bucket_name"
              value={bucketName}
              onChange={function onBucketNameChange(event) {
                setBucketName(event.target.value);
              }}
              placeholder="avatars"
              className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100"
            />
            <Button
              type="submit"
              disabled={createBucketMutation.isPending}
              title="Create bucket"
            >
              {createBucketMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </form>
          <div className="divide-y divide-neutral-800">
            {activeBuckets.map(function renderBucket(bucket) {
              return (
                <div
                  key={bucket.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <code className="truncate text-sm text-neutral-200">
                    {bucket.name}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={function onDeleteBucket() {
                      setBucketToDelete(bucket.id);
                    }}
                    title="Delete bucket"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-sm text-neutral-200">
            Access Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={handleCreateKey}
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_11rem]"
          >
            <div className="grid gap-1.5">
              <Label
                htmlFor="access_key_name"
                className="text-xs text-neutral-400"
              >
                Name
              </Label>
              <Input
                id="access_key_name"
                value={keyName}
                onChange={function onKeyNameChange(event) {
                  setKeyName(event.target.value);
                }}
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-neutral-400">Bucket</Label>
              <Select
                value={defaultBucketId}
                onValueChange={setSelectedBucketId}
                disabled={activeBuckets.length === 0}
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                  <SelectValue placeholder="Select bucket" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-800">
                  {activeBuckets.map(function renderBucketOption(bucket) {
                    return (
                      <SelectItem
                        key={bucket.id}
                        value={bucket.id}
                        className="text-neutral-100 focus:bg-neutral-700"
                      >
                        {bucket.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-neutral-400">Permission</Label>
              <Select
                value={permissions}
                onValueChange={function onPermissionChange(value) {
                  if (
                    value === "read-only" ||
                    value === "read-write" ||
                    value === "full"
                  ) {
                    setPermissions(value);
                  }
                }}
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-800">
                  <SelectItem value="read-only">Read only</SelectItem>
                  <SelectItem value="read-write">Read/write</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <span aria-hidden="true" className="hidden h-4 md:block" />
              <Button
                type="submit"
                disabled={createKeyMutation.isPending || !defaultBucketId}
                className="w-full"
              >
                {createKeyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Create key
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="divide-y divide-neutral-800">
            {activeKeys.map(function renderAccessKey(accessKey) {
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
                    onClick={function onRevokeKey() {
                      setKeyToRevoke(accessKey.id);
                    }}
                    title="Revoke key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {activeKeys.length === 0 && (
              <p className="py-4 text-sm text-neutral-500">
                No access keys yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={bucketToDelete !== null}
        onOpenChange={function onBucketDialogOpenChange(open) {
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
        onOpenChange={function onKeyDialogOpenChange(open) {
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
