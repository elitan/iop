"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingCard } from "@/components/setting-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useDatabaseBackupConfig,
  useListDatabaseBackups,
  useRestoreDatabaseBackup,
  useRunDatabaseBackup,
  useTestDatabaseBackupConnection,
  useUpsertDatabaseBackupConfig,
} from "@/hooks/use-databases";

type BackupIntervalUnit = "minutes" | "hours" | "days";
type BackupProvider = "aws" | "cloudflare" | "backblaze" | "custom";
const DEFAULT_S3_PREFIX = "frost-backups";

export interface DatabaseBackupTargetOption {
  id: string;
  name: string;
  sourceTargetId: string | null;
  createdAt: number;
}

interface DatabaseBackupSettingsPanelProps {
  databaseId: string;
  targets: DatabaseBackupTargetOption[];
}

interface BackupFormState {
  enabled: boolean;
  selectedTargetIds: string[];
  intervalValue: number;
  intervalUnit: BackupIntervalUnit;
  retentionDays: number;
  s3Provider: BackupProvider;
  accountId: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  useExistingSecret: boolean;
}

function parseCloudflareAccountId(endpoint: string | null): string {
  if (!endpoint) {
    return "";
  }
  const match = endpoint.match(
    /^https:\/\/([a-zA-Z0-9-]+)\.r2\.cloudflarestorage\.com\/?$/,
  );
  return match?.[1] ?? "";
}

function parseBackblazeRegion(endpoint: string | null): string {
  if (!endpoint) {
    return "";
  }
  const match = endpoint.match(
    /^https:\/\/s3\.([a-z0-9-]+)\.backblazeb2\.com\/?$/,
  );
  return match?.[1] ?? "";
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function formatBackupLabel(input: {
  sourceTargetName: string;
  createdAt: number;
  hasGlobals: boolean;
}): string {
  const globals = input.hasGlobals ? " • globals" : "";
  return `${formatDate(input.createdAt)} • ${input.sourceTargetName}${globals}`;
}

function getDefaultS3Prefix(prefix: string | null | undefined): string {
  const value = prefix?.trim() ?? "";
  return value.length > 0 ? value : DEFAULT_S3_PREFIX;
}

interface BackupBranchTreeRow {
  target: DatabaseBackupTargetOption;
  depth: number;
}

function buildBackupBranchTreeRows(
  targets: DatabaseBackupTargetOption[],
): BackupBranchTreeRow[] {
  const byId = new Map<string, DatabaseBackupTargetOption>(
    targets.map(function toPair(target) {
      return [target.id, target];
    }),
  );
  const rootKey = "__root__";
  const childrenByParent = new Map<string, DatabaseBackupTargetOption[]>();

  for (const target of targets) {
    const parentId =
      target.sourceTargetId && byId.has(target.sourceTargetId)
        ? target.sourceTargetId
        : rootKey;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(target);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(function byOrder(left, right) {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return left.name.localeCompare(right.name);
    });
  }

  const rows: BackupBranchTreeRow[] = [];

  function walk(parentId: string, depth: number) {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      rows.push({ target: child, depth });
      walk(child.id, depth + 1);
    }
  }

  walk(rootKey, 0);
  return rows;
}

function createDefaultForm(
  targets: DatabaseBackupTargetOption[],
): BackupFormState {
  const mainTarget =
    targets.find(function byMain(target) {
      return target.name === "main";
    }) ??
    targets[0] ??
    null;
  return {
    enabled: false,
    selectedTargetIds: mainTarget ? [mainTarget.id] : [],
    intervalValue: 6,
    intervalUnit: "hours",
    retentionDays: 30,
    s3Provider: "aws",
    accountId: "",
    endpoint: "",
    region: "",
    bucket: "",
    prefix: DEFAULT_S3_PREFIX,
    accessKeyId: "",
    secretAccessKey: "",
    useExistingSecret: false,
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function resolveProviderFields(form: BackupFormState): {
  endpoint: string | null;
  region: string | null;
} {
  if (form.s3Provider === "cloudflare") {
    const accountId = form.accountId.trim();
    return {
      endpoint:
        accountId.length > 0
          ? `https://${accountId}.r2.cloudflarestorage.com`
          : null,
      region: "auto",
    };
  }

  if (form.s3Provider === "backblaze") {
    const region = form.region.trim();
    return {
      endpoint:
        region.length > 0 ? `https://s3.${region}.backblazeb2.com` : null,
      region: region.length > 0 ? region : null,
    };
  }

  return {
    endpoint: form.endpoint.trim().length > 0 ? form.endpoint.trim() : null,
    region: form.region.trim().length > 0 ? form.region.trim() : null,
  };
}

export function DatabaseBackupSettingsPanel({
  databaseId,
  targets,
}: DatabaseBackupSettingsPanelProps) {
  const backupConfigQuery = useDatabaseBackupConfig(databaseId);
  const listBackupsQuery = useListDatabaseBackups(databaseId);
  const upsertMutation = useUpsertDatabaseBackupConfig(databaseId);
  const testConnectionMutation = useTestDatabaseBackupConnection(databaseId);
  const runBackupMutation = useRunDatabaseBackup(databaseId);
  const restoreMutation = useRestoreDatabaseBackup(databaseId);

  const [form, setForm] = useState<BackupFormState>(function init() {
    return createDefaultForm(targets);
  });
  const [restoreBackupPath, setRestoreBackupPath] = useState("");
  const [restoreTargetBranchName, setRestoreTargetBranchName] = useState("");
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [showOtherBranches, setShowOtherBranches] = useState(false);

  useEffect(
    function syncForm() {
      const data = backupConfigQuery.data;
      if (!data) {
        setForm(createDefaultForm(targets));
        return;
      }

      setForm({
        enabled: data.enabled,
        selectedTargetIds:
          data.selectedTargetIds.length > 0
            ? data.selectedTargetIds
            : targets.length > 0
              ? [targets[0].id]
              : [],
        intervalValue: data.intervalValue,
        intervalUnit: data.intervalUnit as BackupIntervalUnit,
        retentionDays: data.retentionDays,
        s3Provider: data.s3Provider as BackupProvider,
        accountId: parseCloudflareAccountId(data.s3Endpoint),
        endpoint: data.s3Endpoint ?? "",
        region: data.s3Region ?? parseBackblazeRegion(data.s3Endpoint),
        bucket: data.s3Bucket,
        prefix: getDefaultS3Prefix(data.s3Prefix),
        accessKeyId: data.s3AccessKeyId,
        secretAccessKey: "",
        useExistingSecret: data.hasSecretAccessKey,
      });
    },
    [backupConfigQuery.data, targets],
  );

  useEffect(
    function ensureSelectedTargetsExist() {
      if (targets.length === 0) {
        return;
      }
      const available = new Set(
        targets.map(function toId(target) {
          return target.id;
        }),
      );
      const next = form.selectedTargetIds.filter(function hasTarget(id) {
        return available.has(id);
      });
      if (next.length > 0) {
        if (next.length !== form.selectedTargetIds.length) {
          setForm(function update(current) {
            return { ...current, selectedTargetIds: next };
          });
        }
        return;
      }
      setForm(function update(current) {
        const mainTarget =
          targets.find(function byMain(target) {
            return target.name === "main";
          }) ?? targets[0];
        return {
          ...current,
          selectedTargetIds: [mainTarget.id],
        };
      });
    },
    [form.selectedTargetIds, targets],
  );

  useEffect(
    function syncRestoreDefaults() {
      const backups = listBackupsQuery.data ?? [];
      if (backups.length === 0) {
        if (restoreBackupPath.length > 0) {
          setRestoreBackupPath("");
        }
        return;
      }

      const selected = backups.find(function byPath(backup) {
        return backup.backupPath === restoreBackupPath;
      });

      if (selected) {
        if (restoreTargetBranchName.length === 0) {
          setRestoreTargetBranchName(selected.sourceTargetName);
        }
        return;
      }

      const newest = backups[0];
      setRestoreBackupPath(newest.backupPath);
      setRestoreTargetBranchName(newest.sourceTargetName);
    },
    [listBackupsQuery.data, restoreBackupPath, restoreTargetBranchName],
  );

  function toggleTarget(targetId: string) {
    setForm(function update(current) {
      const selected = new Set(current.selectedTargetIds);
      if (selected.has(targetId)) {
        selected.delete(targetId);
      } else {
        selected.add(targetId);
      }

      const values = Array.from(selected);
      if (values.length === 0) {
        return current;
      }

      return {
        ...current,
        selectedTargetIds: values,
      };
    });
  }

  async function saveConfig() {
    const providerFields = resolveProviderFields(form);

    try {
      await upsertMutation.mutateAsync({
        enabled: form.enabled,
        selectedTargetIds: form.selectedTargetIds,
        intervalValue: form.intervalValue,
        intervalUnit: form.intervalUnit,
        retentionDays: form.retentionDays,
        s3Provider: form.s3Provider,
        s3Endpoint: providerFields.endpoint,
        s3Region: providerFields.region,
        s3Bucket: form.bucket.trim(),
        s3Prefix: getDefaultS3Prefix(form.prefix),
        s3AccessKeyId: form.accessKeyId.trim(),
        s3SecretAccessKey:
          form.secretAccessKey.trim().length > 0
            ? form.secretAccessKey
            : undefined,
        s3ForcePathStyle: form.s3Provider === "custom",
        includeGlobals: true,
      });
      setForm(function update(current) {
        return {
          ...current,
          secretAccessKey: "",
          useExistingSecret: true,
        };
      });
      toast.success("Backup settings saved");
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to save backup settings"));
    }
  }

  async function testConnection() {
    try {
      await saveConfig();
      await testConnectionMutation.mutateAsync();
      toast.success("S3 connection works");
    } catch (error) {
      toast.error(toErrorMessage(error, "S3 test failed"));
    }
  }

  async function runBackupNow() {
    try {
      await runBackupMutation.mutateAsync();
      toast.success("Backup completed");
    } catch (error) {
      toast.error(toErrorMessage(error, "Backup run failed"));
    }
  }

  function startRestore(backupPath: string, sourceBranchName: string) {
    setRestoreBackupPath(backupPath);
    setRestoreTargetBranchName(sourceBranchName);
  }

  async function confirmRestore() {
    try {
      await restoreMutation.mutateAsync({
        backupPath: restoreBackupPath,
        targetBranchName: restoreTargetBranchName.trim(),
        createIfMissing: true,
        allowOverwrite: true,
      });
      setConfirmRestoreOpen(false);
      toast.success("Backup restored");
    } catch (error) {
      toast.error(toErrorMessage(error, "Restore failed"));
    }
  }

  const selectedBackup = listBackupsQuery.data?.find(function byPath(backup) {
    return backup.backupPath === restoreBackupPath;
  });
  const branchTreeRows = buildBackupBranchTreeRows(targets);
  const mainTarget =
    branchTreeRows.find(function byMain(row) {
      return row.target.name === "main";
    })?.target ??
    branchTreeRows[0]?.target ??
    null;
  const mainDepth =
    branchTreeRows.find(function byId(row) {
      return row.target.id === mainTarget?.id;
    })?.depth ?? 0;
  const otherBranchRows = branchTreeRows
    .filter(function notMain(row) {
      return row.target.id !== mainTarget?.id;
    })
    .map(function toDisplayRow(row) {
      return {
        target: row.target,
        depth: Math.max(0, row.depth - mainDepth),
      };
    });
  const selectedOtherBranches = otherBranchRows.filter(
    function isSelected(row) {
      return form.selectedTargetIds.includes(row.target.id);
    },
  ).length;
  const restoreBranchNames = Array.from(
    new Set(
      [
        ...targets.map(function toName(target) {
          return target.name;
        }),
        selectedBackup?.sourceTargetName ?? "",
        restoreTargetBranchName,
      ].filter(function nonEmpty(value) {
        return value.trim().length > 0;
      }),
    ),
  );

  return (
    <div className="space-y-4">
      <SettingCard
        title="Backups"
        description="Configure branch backups to an S3-compatible bucket."
        footerRight={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={function onClick() {
                void testConnection();
              }}
              disabled={
                upsertMutation.isPending || testConnectionMutation.isPending
              }
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test connection"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={function onClick() {
                void runBackupNow();
              }}
              disabled={runBackupMutation.isPending}
            >
              {runBackupMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                "Run backup now"
              )}
            </Button>
            <Button
              type="button"
              onClick={function onClick() {
                void saveConfig();
              }}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              onCheckedChange={function onCheckedChange(value) {
                setForm(function update(current) {
                  return { ...current, enabled: value };
                });
              }}
            />
            <Label>Enable backups</Label>
            {backupConfigQuery.data?.running && (
              <Badge
                variant="outline"
                className="border-neutral-700 text-neutral-300"
              >
                running
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label>Branches to backup</Label>
            {mainTarget && (
              <label className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={form.selectedTargetIds.includes(mainTarget.id)}
                  onChange={function onChange() {
                    toggleTarget(mainTarget.id);
                  }}
                />
                <span>{mainTarget.name}</span>
              </label>
            )}
            {otherBranchRows.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
                  onClick={function onClick() {
                    setShowOtherBranches(function update(current) {
                      return !current;
                    });
                  }}
                >
                  <span>
                    Branches ({otherBranchRows.length})
                    {selectedOtherBranches > 0 &&
                      ` • ${selectedOtherBranches} selected`}
                  </span>
                  <ChevronRight
                    className={
                      showOtherBranches
                        ? "h-4 w-4 rotate-90 transition-transform"
                        : "h-4 w-4 transition-transform"
                    }
                  />
                </button>
                {showOtherBranches && (
                  <div className="space-y-2">
                    {otherBranchRows.map(function renderRow(row) {
                      const target = row.target;
                      const checked = form.selectedTargetIds.includes(
                        target.id,
                      );
                      return (
                        <label
                          key={target.id}
                          className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
                          style={{ paddingLeft: `${12 + row.depth * 20}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={function onChange() {
                              toggleTarget(target.id);
                            }}
                          />
                          <span>{target.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {!mainTarget && (
              <div className="text-xs text-neutral-400">
                No branches available.
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Every</Label>
              <Input
                type="number"
                min={1}
                value={form.intervalValue}
                onChange={function onChange(event) {
                  setForm(function update(current) {
                    return {
                      ...current,
                      intervalValue:
                        Number.parseInt(event.target.value, 10) || 1,
                    };
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={form.intervalUnit}
                onValueChange={function onChange(value) {
                  setForm(function update(current) {
                    return {
                      ...current,
                      intervalUnit: value as BackupIntervalUnit,
                    };
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">minutes</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="days">days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Retention days</Label>
              <Input
                type="number"
                min={1}
                value={form.retentionDays}
                onChange={function onChange(event) {
                  setForm(function update(current) {
                    return {
                      ...current,
                      retentionDays:
                        Number.parseInt(event.target.value, 10) || 1,
                    };
                  });
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.s3Provider}
                onValueChange={function onChange(value) {
                  setForm(function update(current) {
                    return { ...current, s3Provider: value as BackupProvider };
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aws">AWS S3</SelectItem>
                  <SelectItem value="cloudflare">Cloudflare R2</SelectItem>
                  <SelectItem value="backblaze">Backblaze B2</SelectItem>
                  <SelectItem value="custom">Custom S3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bucket</Label>
              <Input
                value={form.bucket}
                onChange={function onChange(event) {
                  setForm(function update(current) {
                    return { ...current, bucket: event.target.value };
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Access key id</Label>
              <Input
                value={form.accessKeyId}
                onChange={function onChange(event) {
                  setForm(function update(current) {
                    return { ...current, accessKeyId: event.target.value };
                  });
                }}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Secret access key</Label>
              <Input
                type="password"
                value={form.secretAccessKey}
                onChange={function onChange(event) {
                  setForm(function update(current) {
                    return {
                      ...current,
                      secretAccessKey: event.target.value,
                    };
                  });
                }}
                placeholder={
                  form.useExistingSecret
                    ? "leave empty to keep existing key"
                    : "required"
                }
              />
            </div>
          </div>

          {form.s3Provider === "cloudflare" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Account id</Label>
                <Input
                  value={form.accountId}
                  onChange={function onChange(event) {
                    setForm(function update(current) {
                      return { ...current, accountId: event.target.value };
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input
                  value={
                    form.accountId.trim().length > 0
                      ? `https://${form.accountId.trim()}.r2.cloudflarestorage.com`
                      : ""
                  }
                  readOnly
                />
              </div>
            </div>
          )}

          {form.s3Provider === "backblaze" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Region</Label>
                <Input
                  value={form.region}
                  onChange={function onChange(event) {
                    setForm(function update(current) {
                      return { ...current, region: event.target.value };
                    });
                  }}
                  placeholder="us-west-004"
                />
              </div>
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input
                  value={
                    form.region.trim().length > 0
                      ? `https://s3.${form.region.trim()}.backblazeb2.com`
                      : ""
                  }
                  readOnly
                />
              </div>
            </div>
          )}

          {(form.s3Provider === "aws" || form.s3Provider === "custom") && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Region</Label>
                <Input
                  value={form.region}
                  onChange={function onChange(event) {
                    setForm(function update(current) {
                      return { ...current, region: event.target.value };
                    });
                  }}
                  placeholder="us-east-1"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Endpoint {form.s3Provider === "custom" ? "" : "(optional)"}
                </Label>
                <Input
                  value={form.endpoint}
                  onChange={function onChange(event) {
                    setForm(function update(current) {
                      return { ...current, endpoint: event.target.value };
                    });
                  }}
                  placeholder={
                    form.s3Provider === "custom"
                      ? "https://s3.example.com"
                      : "https://s3.us-east-1.amazonaws.com"
                  }
                />
              </div>
            </div>
          )}

          <div className="space-y-1 text-xs text-neutral-400">
            <div>
              Last run:{" "}
              {backupConfigQuery.data?.lastRunAt
                ? formatDate(backupConfigQuery.data.lastRunAt)
                : "never"}
            </div>
            <div>
              Last success:{" "}
              {backupConfigQuery.data?.lastSuccessAt
                ? formatDate(backupConfigQuery.data.lastSuccessAt)
                : "never"}
            </div>
            {backupConfigQuery.data?.lastError && (
              <div className="text-red-300">
                Last error: {backupConfigQuery.data.lastError}
              </div>
            )}
          </div>
        </div>
      </SettingCard>

      <SettingCard
        title="Restore"
        description="Restore one backup to one branch."
      >
        <div className="space-y-3">
          {listBackupsQuery.isLoading && (
            <div className="text-sm text-neutral-400">Loading backups...</div>
          )}

          {listBackupsQuery.data && listBackupsQuery.data.length === 0 && (
            <div className="text-sm text-neutral-400">No backups found.</div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Backup</Label>
              <Select
                value={restoreBackupPath || undefined}
                onValueChange={function onValueChange(value) {
                  const backup = listBackupsQuery.data?.find(
                    function byPath(item) {
                      return item.backupPath === value;
                    },
                  );
                  if (backup) {
                    startRestore(backup.backupPath, backup.sourceTargetName);
                    return;
                  }
                  setRestoreBackupPath(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select backup" />
                </SelectTrigger>
                <SelectContent>
                  {listBackupsQuery.data?.map(function renderBackup(backup) {
                    return (
                      <SelectItem
                        key={backup.backupPath}
                        value={backup.backupPath}
                      >
                        {formatBackupLabel(backup)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedBackup && (
                <div className="text-xs text-neutral-500">
                  {selectedBackup.backupPath}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Target branch</Label>
              <Select
                value={restoreTargetBranchName || undefined}
                onValueChange={setRestoreTargetBranchName}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target branch" />
                </SelectTrigger>
                <SelectContent>
                  {restoreBranchNames.map(function renderBranch(name) {
                    return (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            variant="destructive"
            disabled={
              restoreBackupPath.trim().length === 0 ||
              restoreTargetBranchName.trim().length === 0 ||
              restoreMutation.isPending
            }
            onClick={function onClick() {
              setConfirmRestoreOpen(true);
            }}
          >
            {restoreMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Restoring...
              </>
            ) : (
              "Restore with overwrite"
            )}
          </Button>
        </div>
      </SettingCard>

      <ConfirmDialog
        open={confirmRestoreOpen}
        onOpenChange={setConfirmRestoreOpen}
        title="Restore backup"
        description={`Restore backup into branch ${restoreTargetBranchName || "target"}? Existing data will be overwritten.`}
        confirmLabel="Restore"
        variant="destructive"
        loading={restoreMutation.isPending}
        onConfirm={function onConfirm() {
          void confirmRestore();
        }}
      />
    </div>
  );
}
