import type { Kysely } from "kysely";
import { getSetting, setSetting } from "./auth";
import { db } from "./db";
import type { DB } from "./db-types";
import {
  getImageCreatedAt,
  getImageSize,
  getRunningImageNames,
  isNetworkInUse,
  listFrostImages,
  listFrostNetworks,
  pruneBuildCache,
  pruneDanglingImages,
  pruneStoppedContainers,
  removeImage,
  removeNetwork,
} from "./docker";
import { compactSqliteDatabase } from "./sqlite-maintenance";

const CLEANUP_LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000;

async function isImageRollbackEligible(imageName: string): Promise<boolean> {
  const deployment = await db
    .selectFrom("deployments")
    .select("id")
    .where("imageName", "=", imageName)
    .where("rollbackEligible", "=", true)
    .executeTakeFirst();
  return deployment !== undefined;
}

export interface CleanupOptions {
  keepImages: number;
  pruneDangling: boolean;
  pruneNetworks: boolean;
}

export interface CleanupResult {
  success: boolean;
  deletedImages: string[];
  deletedNetworks: string[];
  prunedContainers: number;
  prunedBuildCacheBytes: number;
  compactedDatabaseBytes: number;
  freedBytes: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

interface CleanupLockSettings {
  settings: CleanupSettings;
  startedAt: string | null;
}

function parseCleanupSettings(
  settingValues: Map<string, string>,
): CleanupLockSettings {
  const lastResult = settingValues.get("cleanup_last_result") ?? null;

  return {
    settings: {
      enabled: settingValues.get("cleanup_enabled") !== "false",
      keepImages: Number.parseInt(
        settingValues.get("cleanup_keep_images") ?? "3",
        10,
      ),
      pruneDangling: settingValues.get("cleanup_prune_dangling") !== "false",
      pruneNetworks: settingValues.get("cleanup_prune_networks") !== "false",
      running: settingValues.get("cleanup_running") === "true",
      lastRun: settingValues.get("cleanup_last_run") ?? null,
      lastResult: lastResult ? JSON.parse(lastResult) : null,
    },
    startedAt: settingValues.get("cleanup_started_at") ?? null,
  };
}

export function isCleanupLockStale(
  running: boolean,
  startedAt: string | null,
  now: Date,
): boolean {
  if (!running) return false;
  if (!startedAt) return true;

  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return true;

  return now.getTime() - startedAtMs >= CLEANUP_LOCK_TIMEOUT_MS;
}

export async function claimCleanupJob(
  database: Kysely<DB> = db,
  now: Date = new Date(),
): Promise<CleanupSettings | null> {
  return await database.transaction().execute(async function claimLock(trx) {
    await trx
      .insertInto("settings")
      .values({ key: "cleanup_running", value: "false" })
      .onConflict(function ignoreExistingLock(oc) {
        return oc.column("key").doNothing();
      })
      .execute();

    const rows = await trx
      .selectFrom("settings")
      .select(["key", "value"])
      .where("key", "in", [
        "cleanup_enabled",
        "cleanup_keep_images",
        "cleanup_prune_dangling",
        "cleanup_prune_networks",
        "cleanup_running",
        "cleanup_started_at",
        "cleanup_last_run",
        "cleanup_last_result",
      ])
      .execute();
    const values = new Map(
      rows.map(function toEntry(row) {
        return [row.key, row.value];
      }),
    );
    const lockSettings = parseCleanupSettings(values);
    if (
      lockSettings.settings.running &&
      !isCleanupLockStale(true, lockSettings.startedAt, now)
    ) {
      return null;
    }

    await trx
      .insertInto("settings")
      .values([
        { key: "cleanup_running", value: "true" },
        { key: "cleanup_started_at", value: now.toISOString() },
      ])
      .onConflict(function updateLock(oc) {
        return oc.column("key").doUpdateSet(function useIncomingValue(eb) {
          return { value: eb.ref("excluded.value") };
        });
      })
      .execute();

    return { ...lockSettings.settings, running: true };
  });
}

export interface CleanupSettings {
  enabled: boolean;
  keepImages: number;
  pruneDangling: boolean;
  pruneNetworks: boolean;
  running: boolean;
  lastRun: string | null;
  lastResult: CleanupResult | null;
}

export async function getCleanupSettings(): Promise<CleanupSettings> {
  const [
    enabled,
    keepImages,
    pruneDangling,
    pruneNetworks,
    running,
    startedAt,
    lastRun,
    lastResult,
  ] = await Promise.all([
    getSetting("cleanup_enabled"),
    getSetting("cleanup_keep_images"),
    getSetting("cleanup_prune_dangling"),
    getSetting("cleanup_prune_networks"),
    getSetting("cleanup_running"),
    getSetting("cleanup_started_at"),
    getSetting("cleanup_last_run"),
    getSetting("cleanup_last_result"),
  ]);

  return {
    enabled: enabled !== "false",
    keepImages: keepImages ? parseInt(keepImages, 10) : 3,
    pruneDangling: pruneDangling !== "false",
    pruneNetworks: pruneNetworks !== "false",
    running:
      running === "true" && !isCleanupLockStale(true, startedAt, new Date()),
    lastRun,
    lastResult: lastResult ? JSON.parse(lastResult) : null,
  };
}

export async function updateCleanupSettings(
  settings: Partial<
    Pick<
      CleanupSettings,
      "enabled" | "keepImages" | "pruneDangling" | "pruneNetworks"
    >
  >,
): Promise<void> {
  const settingMap: Record<string, string | undefined> = {
    cleanup_enabled:
      settings.enabled !== undefined ? String(settings.enabled) : undefined,
    cleanup_keep_images:
      settings.keepImages !== undefined
        ? String(settings.keepImages)
        : undefined,
    cleanup_prune_dangling:
      settings.pruneDangling !== undefined
        ? String(settings.pruneDangling)
        : undefined,
    cleanup_prune_networks:
      settings.pruneNetworks !== undefined
        ? String(settings.pruneNetworks)
        : undefined,
  };

  const updates = Object.entries(settingMap)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => setSetting(key, value));

  await Promise.all(updates);
}

export async function runCleanup(
  options: CleanupOptions,
): Promise<CleanupResult> {
  const startedAt = new Date().toISOString();
  const result: CleanupResult = {
    success: true,
    deletedImages: [],
    deletedNetworks: [],
    prunedContainers: 0,
    prunedBuildCacheBytes: 0,
    compactedDatabaseBytes: 0,
    freedBytes: 0,
    errors: [],
    startedAt,
    finishedAt: "",
  };

  try {
    const runningImages = await getRunningImageNames();
    const allImages = await listFrostImages();

    const imagesByService = new Map<
      string,
      { name: string; created: Date; size: number }[]
    >();
    for (const image of allImages) {
      const match = image.match(/^(frost-[^:]+):/);
      if (!match) continue;

      const servicePrefix = match[1];
      const created = await getImageCreatedAt(image).catch(() => new Date(0));
      const size = await getImageSize(image);

      const list = imagesByService.get(servicePrefix) || [];
      list.push({ name: image, created, size });
      imagesByService.set(servicePrefix, list);
    }

    for (const [, images] of imagesByService) {
      images.sort((a, b) => b.created.getTime() - a.created.getTime());

      const toDelete = images.slice(options.keepImages);
      for (const img of toDelete) {
        if (runningImages.has(img.name)) {
          continue;
        }

        if (await isImageRollbackEligible(img.name)) {
          continue;
        }

        const deleted = await removeImage(img.name);
        if (deleted) {
          result.deletedImages.push(img.name);
          result.freedBytes += img.size;
        } else {
          result.errors.push(`Failed to remove image: ${img.name}`);
        }
      }
    }

    if (options.pruneDangling) {
      const { bytes } = await pruneDanglingImages();
      result.freedBytes += bytes;
    }

    const buildCacheResult = await pruneBuildCache();
    result.prunedBuildCacheBytes = buildCacheResult.bytes;
    result.freedBytes += buildCacheResult.bytes;

    result.prunedContainers = await pruneStoppedContainers();

    if (options.pruneNetworks) {
      const networks = await listFrostNetworks();
      for (const network of networks) {
        const inUse = await isNetworkInUse(network);
        if (!inUse) {
          await removeNetwork(network);
          result.deletedNetworks.push(network);
        }
      }
    }

    result.compactedDatabaseBytes = compactSqliteDatabase();
    result.freedBytes += result.compactedDatabaseBytes;
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

export async function startCleanupJob(): Promise<boolean> {
  const settings = await claimCleanupJob();
  if (!settings) {
    return false;
  }

  void (async function executeCleanup() {
    let result: CleanupResult;
    try {
      result = await runCleanup({
        keepImages: settings.keepImages,
        pruneDangling: settings.pruneDangling,
        pruneNetworks: settings.pruneNetworks,
      });
    } catch (err) {
      const now = new Date().toISOString();
      result = {
        success: false,
        deletedImages: [],
        deletedNetworks: [],
        prunedContainers: 0,
        prunedBuildCacheBytes: 0,
        compactedDatabaseBytes: 0,
        freedBytes: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        startedAt: now,
        finishedAt: now,
      };
    }

    try {
      await setSetting("cleanup_last_result", JSON.stringify(result));
      await setSetting("cleanup_last_run", result.finishedAt);
    } finally {
      await setSetting("cleanup_running", "false");
      await setSetting("cleanup_started_at", "");
    }
  })().catch(function logCleanupPersistenceError(err) {
    console.error("[cleanup] Failed to persist cleanup result:", err);
  });

  return true;
}
