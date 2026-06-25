"use client";

import {
  Copy,
  FileIcon,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContractOutputs } from "@/contracts";
import {
  useCreateObjectStorageAccessKey,
  useCreateObjectStorageBucket,
  useDeleteObjectStorageBucket,
  useObjectStorage,
  useObjectStorageBucketObjects,
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
  const [bucketTab, setBucketTab] = useState<"files" | "access-keys">("files");
  const [objectPrefixInput, setObjectPrefixInput] = useState("");
  const [objectPrefix, setObjectPrefix] = useState("");
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
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
      const selectedBucket = activeBuckets.find(function findBucket(bucket) {
        return bucket.id === selectedBucketId;
      });
      return selectedBucket?.id ?? activeBuckets[0]?.id ?? "";
    },
    [activeBuckets, selectedBucketId],
  );

  const selectedBucket = useMemo(
    function getSelectedBucket() {
      return activeBuckets.find(function findBucket(bucket) {
        return bucket.id === defaultBucketId;
      });
    },
    [activeBuckets, defaultBucketId],
  );

  const bucketObjectsQuery = useObjectStorageBucketObjects({
    objectStorageId,
    bucketId: defaultBucketId,
    prefix: objectPrefix,
  });
  const bucketObjects =
    bucketObjectsQuery.data?.pages.flatMap(function getPageObjects(page) {
      return page.objects;
    }) ?? [];
  const selectedBucketAccessKeys = activeKeys.filter(
    function getSelectedBucketAccessKeys(accessKey) {
      return accessKey.bucketId === defaultBucketId;
    },
  );

  async function handleCreateBucket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bucketName.trim()) {
      return;
    }

    try {
      const bucket = await createBucketMutation.mutateAsync({
        name: bucketName.trim(),
      });
      setBucketName("");
      setSelectedBucketId(bucket.id);
      setObjectPrefix("");
      setObjectPrefixInput("");
      setCreateBucketOpen(false);
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

  function handleSelectBucket(bucketId: string) {
    setSelectedBucketId(bucketId);
    setObjectPrefix("");
    setObjectPrefixInput("");
  }

  function handleObjectPrefixSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setObjectPrefix(normalizePrefixInput(objectPrefixInput));
  }

  function handleBucketTabChange(value: string) {
    if (value === "files" || value === "access-keys") {
      setBucketTab(value);
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
      setCreateKeyOpen(false);
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
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-neutral-200">Buckets</CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={function onOpenCreateBucket() {
                setCreateBucketOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New bucket
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y divide-neutral-800">
            {activeBuckets.map(function renderBucket(bucket) {
              return (
                <div
                  key={bucket.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <Button
                    type="button"
                    variant={
                      bucket.id === defaultBucketId ? "secondary" : "ghost"
                    }
                    className="min-w-0 flex-1 justify-start px-2"
                    onClick={function onSelectBucket() {
                      handleSelectBucket(bucket.id);
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
            {activeBuckets.length === 0 && (
              <p className="py-4 text-sm text-neutral-500">No buckets yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm text-neutral-200">Bucket</CardTitle>
              {selectedBucket ? (
                <code className="block truncate text-xs text-neutral-500">
                  {selectedBucket.name}
                </code>
              ) : (
                <p className="text-xs text-neutral-500">No bucket selected</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedBucket ? (
            <p className="py-4 text-sm text-neutral-500">
              Select a bucket to view files and keys.
            </p>
          ) : (
            <Tabs
              value={bucketTab}
              onValueChange={handleBucketTabChange}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList className="border border-neutral-800 bg-neutral-950">
                  <TabsTrigger value="files">Files</TabsTrigger>
                  <TabsTrigger value="access-keys">Access keys</TabsTrigger>
                </TabsList>
                {bucketTab === "access-keys" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={function onOpenCreateKey() {
                      setCreateKeyOpen(true);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    New key
                  </Button>
                )}
              </div>

              <TabsContent value="files" className="space-y-3">
                <form
                  onSubmit={handleObjectPrefixSubmit}
                  className="grid gap-2 md:grid-cols-[minmax(0,1fr)_6rem_2.25rem]"
                >
                  <Label
                    htmlFor="object_storage_object_prefix"
                    className="sr-only"
                  >
                    Prefix
                  </Label>
                  <Input
                    id="object_storage_object_prefix"
                    value={objectPrefixInput}
                    onChange={function onObjectPrefixChange(event) {
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
                    onClick={function onRefreshObjects() {
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
                    <p className="py-4 text-sm text-neutral-500">
                      No files found.
                    </p>
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
                    onClick={function onLoadMoreObjects() {
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
              </TabsContent>

              <TabsContent value="access-keys" className="space-y-3">
                <div className="divide-y divide-neutral-800">
                  {selectedBucketAccessKeys.map(
                    function renderAccessKey(accessKey) {
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
                    },
                  )}
                  {selectedBucketAccessKeys.length === 0 && (
                    <p className="py-4 text-sm text-neutral-500">
                      No access keys for this bucket.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={createBucketOpen} onOpenChange={setCreateBucketOpen}>
        <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">New bucket</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBucket} className="space-y-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor="object_storage_bucket_name"
                className="text-xs text-neutral-400"
              >
                Name
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={function onCancelCreateBucket() {
                  setCreateBucketOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createBucketMutation.isPending || !bucketName.trim()}
              >
                {createBucketMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create bucket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createKeyOpen} onOpenChange={setCreateKeyOpen}>
        <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">
              {selectedBucket
                ? `New key for ${selectedBucket.name}`
                : "New key"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div className="grid gap-3">
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={function onCancelCreateKey() {
                  setCreateKeyOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createKeyMutation.isPending ||
                  !defaultBucketId ||
                  !keyName.trim()
                }
              >
                {createKeyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
