import type { Selectable } from "kysely";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import type { Databases } from "./db-types";

export type PostgresBackupIntervalUnit = "minutes" | "hours" | "days";
export type PostgresBackupS3Provider =
  | "aws"
  | "cloudflare"
  | "backblaze"
  | "custom";
const DEFAULT_S3_PREFIX = "frost-backups";

export interface PostgresBackupConfigUpdateInput {
  enabled: boolean;
  selectedTargetIds: string[];
  intervalValue: number;
  intervalUnit: PostgresBackupIntervalUnit;
  retentionDays: number;
  s3Provider: PostgresBackupS3Provider;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  s3SecretAccessKey?: string;
  s3ForcePathStyle: boolean;
  includeGlobals: boolean;
}

export interface PostgresBackupConfigView {
  databaseId: string;
  enabled: boolean;
  selectedTargetIds: string[];
  intervalValue: number;
  intervalUnit: PostgresBackupIntervalUnit;
  retentionDays: number;
  s3Provider: PostgresBackupS3Provider;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  hasSecretAccessKey: boolean;
  s3ForcePathStyle: boolean;
  includeGlobals: boolean;
  running: boolean;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface PostgresBackupConfigInternal extends PostgresBackupConfigView {
  s3SecretAccessKey: string;
}

interface PostgresBackupConfigRow {
  databaseId: string;
  enabled: number | boolean;
  selectedTargetIdsJson: string;
  intervalValue: number;
  intervalUnit: PostgresBackupIntervalUnit;
  retentionDays: number;
  s3Provider: PostgresBackupS3Provider;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  s3SecretAccessKeyEncrypted: string;
  s3ForcePathStyle: number | boolean;
  includeGlobals: number | boolean;
  running: number | boolean;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PostgresBackupEndpointInput {
  provider: PostgresBackupS3Provider;
  endpoint?: string | null;
  accountId?: string | null;
  region?: string | null;
}

function toBoolean(value: number | boolean): boolean {
  return value === true || value === 1;
}

function parseSelectedTargetIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(function isString(item): item is string {
      return typeof item === "string" && item.trim().length > 0;
    });
  } catch {
    return [];
  }
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeNullableText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function assertIntervalValue(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Backup interval value must be an integer >= 1");
  }
}

function assertRetentionDays(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Retention days must be an integer >= 1");
  }
}

function assertIntervalUnit(
  value: string,
): asserts value is PostgresBackupIntervalUnit {
  if (value !== "minutes" && value !== "hours" && value !== "days") {
    throw new Error("Backup interval unit is invalid");
  }
}

function assertProvider(
  value: string,
): asserts value is PostgresBackupS3Provider {
  if (
    value !== "aws" &&
    value !== "cloudflare" &&
    value !== "backblaze" &&
    value !== "custom"
  ) {
    throw new Error("S3 provider is invalid");
  }
}

function toView(
  row: PostgresBackupConfigRow,
  selectedTargetIds: string[],
): PostgresBackupConfigView {
  return {
    databaseId: row.databaseId,
    enabled: toBoolean(row.enabled),
    selectedTargetIds,
    intervalValue: row.intervalValue,
    intervalUnit: row.intervalUnit,
    retentionDays: row.retentionDays,
    s3Provider: row.s3Provider,
    s3Endpoint: row.s3Endpoint,
    s3Region: row.s3Region,
    s3Bucket: row.s3Bucket,
    s3Prefix: row.s3Prefix,
    s3AccessKeyId: row.s3AccessKeyId,
    hasSecretAccessKey: row.s3SecretAccessKeyEncrypted.trim().length > 0,
    s3ForcePathStyle: toBoolean(row.s3ForcePathStyle),
    includeGlobals: toBoolean(row.includeGlobals),
    running: toBoolean(row.running),
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertPostgresDatabase(
  databaseId: string,
): Promise<Selectable<Databases>> {
  const database = await db
    .selectFrom("databases")
    .selectAll()
    .where("id", "=", databaseId)
    .executeTakeFirst();

  if (!database) {
    throw new Error("Database not found");
  }

  if (database.engine !== "postgres") {
    throw new Error("Backups are only available for postgres databases");
  }

  return database;
}

async function listTargetIds(databaseId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("databaseTargets")
    .select("id")
    .where("databaseId", "=", databaseId)
    .orderBy("createdAt", "asc")
    .execute();

  return rows.map(function toId(row) {
    return row.id;
  });
}

async function getMainTargetId(databaseId: string): Promise<string | null> {
  const row = await db
    .selectFrom("databaseTargets")
    .select("id")
    .where("databaseId", "=", databaseId)
    .where("name", "=", "main")
    .executeTakeFirst();

  return row?.id ?? null;
}

async function getBackupRow(
  databaseId: string,
): Promise<PostgresBackupConfigRow | null> {
  const row = await db
    .selectFrom("databaseBackupConfigs")
    .selectAll()
    .where("databaseId", "=", databaseId)
    .executeTakeFirst();

  return (row as PostgresBackupConfigRow | undefined) ?? null;
}

function defaultView(
  databaseId: string,
  selectedTargetIds: string[],
): PostgresBackupConfigView {
  return {
    databaseId,
    enabled: false,
    selectedTargetIds,
    intervalValue: 6,
    intervalUnit: "hours",
    retentionDays: 30,
    s3Provider: "aws",
    s3Endpoint: null,
    s3Region: null,
    s3Bucket: "",
    s3Prefix: DEFAULT_S3_PREFIX,
    s3AccessKeyId: "",
    hasSecretAccessKey: false,
    s3ForcePathStyle: false,
    includeGlobals: true,
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    createdAt: null,
    updatedAt: null,
  };
}

function filterSelectedTargetIds(
  selectedTargetIds: string[],
  existingTargetIds: string[],
  fallbackTargetId: string | null,
): string[] {
  const validTargets = new Set(existingTargetIds);
  const filtered = uniqueValues(selectedTargetIds).filter(function isValid(id) {
    return validTargets.has(id);
  });

  if (filtered.length > 0) {
    return filtered;
  }

  if (fallbackTargetId) {
    return [fallbackTargetId];
  }

  return existingTargetIds.length > 0 ? [existingTargetIds[0]] : [];
}

export function resolveS3EndpointForProvider(
  input: PostgresBackupEndpointInput,
): string | null {
  const endpoint = normalizeNullableText(input.endpoint ?? null);

  if (input.provider === "aws") {
    return endpoint;
  }

  if (input.provider === "cloudflare") {
    const accountId = normalizeNullableText(input.accountId ?? null);
    if (!accountId) {
      return endpoint;
    }
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  if (input.provider === "backblaze") {
    const region = normalizeNullableText(input.region ?? null);
    if (!region) {
      return endpoint;
    }
    return `https://s3.${region}.backblazeb2.com`;
  }

  return endpoint;
}

export function getScheduleIntervalMs(input: {
  intervalValue: number;
  intervalUnit: PostgresBackupIntervalUnit;
}): number {
  if (input.intervalUnit === "minutes") {
    return input.intervalValue * 60 * 1000;
  }
  if (input.intervalUnit === "hours") {
    return input.intervalValue * 60 * 60 * 1000;
  }
  return input.intervalValue * 24 * 60 * 60 * 1000;
}

export async function getPostgresBackupConfig(
  databaseId: string,
): Promise<PostgresBackupConfigView> {
  await assertPostgresDatabase(databaseId);

  const [row, existingTargetIds, mainTargetId] = await Promise.all([
    getBackupRow(databaseId),
    listTargetIds(databaseId),
    getMainTargetId(databaseId),
  ]);

  if (!row) {
    return defaultView(
      databaseId,
      filterSelectedTargetIds([], existingTargetIds, mainTargetId),
    );
  }

  const parsedSelectedTargetIds = parseSelectedTargetIds(
    row.selectedTargetIdsJson,
  );
  const selectedTargetIds = filterSelectedTargetIds(
    parsedSelectedTargetIds,
    existingTargetIds,
    mainTargetId,
  );

  return toView(row, selectedTargetIds);
}

export async function updatePostgresBackupConfig(input: {
  databaseId: string;
  config: PostgresBackupConfigUpdateInput;
}): Promise<PostgresBackupConfigView> {
  await assertPostgresDatabase(input.databaseId);
  assertIntervalValue(input.config.intervalValue);
  assertIntervalUnit(input.config.intervalUnit);
  assertRetentionDays(input.config.retentionDays);
  assertProvider(input.config.s3Provider);

  const s3Bucket = normalizeRequiredText(input.config.s3Bucket, "S3 bucket");
  const s3AccessKeyId = normalizeRequiredText(
    input.config.s3AccessKeyId,
    "S3 access key id",
  );
  const s3Endpoint = normalizeNullableText(input.config.s3Endpoint);
  const s3Region = normalizeNullableText(input.config.s3Region);
  const s3PrefixInput = (input.config.s3Prefix ?? "").trim();
  const s3Prefix = s3PrefixInput.length > 0 ? s3PrefixInput : DEFAULT_S3_PREFIX;
  const selectedTargetIds = uniqueValues(input.config.selectedTargetIds);

  if (selectedTargetIds.length === 0) {
    throw new Error("Select at least one branch for backups");
  }

  if (input.config.s3Provider === "custom" && !s3Endpoint) {
    throw new Error("S3 endpoint is required for custom provider");
  }

  const targets = await db
    .selectFrom("databaseTargets")
    .select("id")
    .where("databaseId", "=", input.databaseId)
    .execute();
  const validTargetIds = new Set(
    targets.map(function toTargetId(target) {
      return target.id;
    }),
  );
  for (const targetId of selectedTargetIds) {
    if (!validTargetIds.has(targetId)) {
      throw new Error("Selected branch not found in this database");
    }
  }

  const existing = await getBackupRow(input.databaseId);
  let secret = input.config.s3SecretAccessKey;
  if (!secret || secret.trim().length === 0) {
    if (!existing || existing.s3SecretAccessKeyEncrypted.trim().length === 0) {
      throw new Error("S3 secret access key is required");
    }
    secret = decrypt(existing.s3SecretAccessKeyEncrypted);
  }

  const now = Date.now();
  const values = {
    databaseId: input.databaseId,
    enabled: input.config.enabled,
    selectedTargetIdsJson: JSON.stringify(selectedTargetIds),
    intervalValue: input.config.intervalValue,
    intervalUnit: input.config.intervalUnit,
    retentionDays: input.config.retentionDays,
    s3Provider: input.config.s3Provider,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3Prefix,
    s3AccessKeyId,
    s3SecretAccessKeyEncrypted: encrypt(secret),
    s3ForcePathStyle: input.config.s3ForcePathStyle,
    includeGlobals: input.config.includeGlobals,
    updatedAt: now,
  };

  await db
    .insertInto("databaseBackupConfigs")
    .values({
      ...values,
      createdAt: now,
      running: false,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
    })
    .onConflict(function onConflict(oc) {
      return oc.column("databaseId").doUpdateSet(values);
    })
    .execute();

  return getPostgresBackupConfig(input.databaseId);
}

export async function getPostgresBackupConfigForRun(
  databaseId: string,
): Promise<PostgresBackupConfigInternal> {
  const row = await getBackupRow(databaseId);
  if (!row) {
    throw new Error("Backup is not configured");
  }

  const selectedTargetIds = parseSelectedTargetIds(row.selectedTargetIdsJson);
  if (selectedTargetIds.length === 0) {
    throw new Error("Backup branch selection is empty");
  }

  if (row.s3SecretAccessKeyEncrypted.trim().length === 0) {
    throw new Error("S3 secret key is missing");
  }

  const view = await getPostgresBackupConfig(databaseId);
  return {
    ...view,
    s3SecretAccessKey: decrypt(row.s3SecretAccessKeyEncrypted),
  };
}

export async function listEnabledPostgresBackupConfigIds(): Promise<string[]> {
  const rows = await db
    .selectFrom("databaseBackupConfigs")
    .select("databaseId")
    .where("enabled", "=", true)
    .execute();

  return rows.map(function toId(row) {
    return row.databaseId;
  });
}

export async function markPostgresBackupRunStarted(
  databaseId: string,
): Promise<boolean> {
  const now = Date.now();
  const result = await db
    .updateTable("databaseBackupConfigs")
    .set({
      running: true,
      lastError: null,
      updatedAt: now,
    })
    .where("databaseId", "=", databaseId)
    .where("running", "=", false)
    .executeTakeFirst();

  const updatedCount = Number(result.numUpdatedRows ?? 0);
  return updatedCount > 0;
}

export async function markPostgresBackupRunFinished(input: {
  databaseId: string;
  success: boolean;
  error: string | null;
}): Promise<void> {
  const now = Date.now();
  await db
    .updateTable("databaseBackupConfigs")
    .set({
      running: false,
      lastRunAt: now,
      lastSuccessAt: input.success ? now : undefined,
      lastError: input.success ? null : input.error,
      updatedAt: now,
    })
    .where("databaseId", "=", input.databaseId)
    .execute();
}
