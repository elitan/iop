import { getSetting, setSetting } from "./auth";
import { db } from "./db";
import {
  getImageCreatedAt,
  getImageSize,
  getRunningImageNames,
  isNetworkInUse,
  listFrostImages,
  listFrostNetworks,
  pruneDanglingImages,
  pruneStoppedContainers,
  removeImage,
  removeNetwork,
} from "./docker";

async function isImageRollbackEligible(imageName: string): Promise<boolean> {
  const deployment = await db
    .selectFrom("deployments")
    .select("id")
    .where("imageName", "=", imageName)
    .where("rollbackEligible", "=", 1)
    .executeTakeFirst();
  return !!deployment;
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
  freedBytes: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
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
    lastRun,
    lastResult,
  ] = await Promise.all([
    getSetting("cleanup_enabled"),
    getSetting("cleanup_keep_images"),
    getSetting("cleanup_prune_dangling"),
    getSetting("cleanup_prune_networks"),
    getSetting("cleanup_running"),
    getSetting("cleanup_last_run"),
    getSetting("cleanup_last_result"),
  ]);

  return {
    enabled: enabled !== "false",
    keepImages: keepImages ? parseInt(keepImages, 10) : 3,
    pruneDangling: pruneDangling !== "false",
    pruneNetworks: pruneNetworks !== "false",
    running: running === "true",
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
  const updates: Promise<void>[] = [];

  if (settings.enabled !== undefined) {
    updates.push(setSetting("cleanup_enabled", String(settings.enabled)));
  }
  if (settings.keepImages !== undefined) {
    updates.push(
      setSetting("cleanup_keep_images", String(settings.keepImages)),
    );
  }
  if (settings.pruneDangling !== undefined) {
    updates.push(
      setSetting("cleanup_prune_dangling", String(settings.pruneDangling)),
    );
  }
  if (settings.pruneNetworks !== undefined) {
    updates.push(
      setSetting("cleanup_prune_networks", String(settings.pruneNetworks)),
    );
  }

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
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

export async function startCleanupJob(): Promise<boolean> {
  const settings = await getCleanupSettings();

  if (settings.running) {
    return false;
  }

  await setSetting("cleanup_running", "true");

  runCleanup({
    keepImages: settings.keepImages,
    pruneDangling: settings.pruneDangling,
    pruneNetworks: settings.pruneNetworks,
  })
    .then(async (result) => {
      await setSetting("cleanup_last_result", JSON.stringify(result));
      await setSetting("cleanup_last_run", result.finishedAt);
      await setSetting("cleanup_running", "false");
    })
    .catch(async (err) => {
      const errorResult: CleanupResult = {
        success: false,
        deletedImages: [],
        deletedNetworks: [],
        prunedContainers: 0,
        freedBytes: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      await setSetting("cleanup_last_result", JSON.stringify(errorResult));
      await setSetting("cleanup_last_run", errorResult.finishedAt);
      await setSetting("cleanup_running", "false");
    });

  return true;
}
