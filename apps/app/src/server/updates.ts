import { getSetting, setSetting } from "@/lib/auth";
import {
  applyUpdate,
  checkForUpdate,
  clearPersistedUpdateResult,
  getCurrentVersion,
  getPersistedUpdateResult,
  getUpdateStatus,
} from "@/lib/updater";
import { os } from "./orpc";

function formatUpdateInfo(info: Awaited<ReturnType<typeof getUpdateStatus>>) {
  return {
    currentVersion: info.currentVersion,
    latestVersion: info.availableVersion,
    updateAvailable: info.availableVersion !== null,
    lastCheck: info.lastCheck ? new Date(info.lastCheck).toISOString() : null,
    restarting: false,
    changelog: info.releaseNotes,
  };
}

const DEFAULT_AUTO_UPDATE_HOUR = 4;

async function getAutoUpdateSettings(): Promise<{
  enabled: boolean;
  hour: number;
}> {
  const enabled = await getSetting("auto_update_enabled");
  const hourStr = await getSetting("auto_update_hour");
  return {
    enabled: enabled !== "false",
    hour: hourStr ? Number.parseInt(hourStr, 10) : DEFAULT_AUTO_UPDATE_HOUR,
  };
}

export const updates = {
  get: os.updates.get.handler(async () => {
    const status = await getUpdateStatus();
    return formatUpdateInfo(status);
  }),

  check: os.updates.check.handler(async () => {
    const result = await checkForUpdate(true);
    if (!result) {
      return {
        currentVersion: getCurrentVersion(),
        latestVersion: null,
        updateAvailable: false,
        lastCheck: new Date().toISOString(),
        restarting: false,
        changelog: null,
      };
    }
    return formatUpdateInfo(result);
  }),

  apply: os.updates.apply.handler(async () => {
    const result = await applyUpdate();

    if (!result.success) {
      throw new Error(result.error || "Failed to apply update");
    }

    return { success: true };
  }),

  getResult: os.updates.getResult.handler(async () => {
    const result = await getPersistedUpdateResult();

    if (!result) {
      return {
        completed: false,
        success: false,
        newVersion: null,
        log: null,
      };
    }

    return result;
  }),

  clearResult: os.updates.clearResult.handler(async () => {
    await clearPersistedUpdateResult();
    return { success: true };
  }),

  getAutoUpdate: os.updates.getAutoUpdate.handler(getAutoUpdateSettings),

  updateAutoUpdate: os.updates.updateAutoUpdate.handler(async ({ input }) => {
    if (input.enabled !== undefined) {
      await setSetting("auto_update_enabled", input.enabled ? "true" : "false");
    }
    if (input.hour !== undefined) {
      await setSetting("auto_update_hour", input.hour.toString());
    }
    return getAutoUpdateSettings();
  }),
};
