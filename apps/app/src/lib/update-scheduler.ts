import { getSetting, setSetting } from "./auth";
import { applyUpdate, checkForUpdate } from "./updater";

const CHECK_INTERVAL_MS = 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastUpdateDate: string | null = null;

async function checkAndRun(): Promise<void> {
  try {
    const enabled = await getSetting("auto_update_enabled");
    if (enabled === "false") return;

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (lastUpdateDate === today) return;

    const hourStr = await getSetting("auto_update_hour");
    const hour = hourStr ? Number.parseInt(hourStr, 10) : 4;

    if (now.getUTCHours() !== hour) return;

    lastUpdateDate = today;
    await setSetting("auto_update_last_run", today);

    console.log("[update-scheduler] Checking for updates...");
    const info = await checkForUpdate(true);
    if (!info?.availableVersion) {
      console.log("[update-scheduler] No update available");
      return;
    }

    console.log(
      `[update-scheduler] Applying update to v${info.availableVersion}`,
    );
    const result = await applyUpdate();
    if (!result.success) {
      console.error("[update-scheduler] Failed to apply update:", result.error);
    }
  } catch (err) {
    console.error("[update-scheduler] Error:", err);
  }
}

export function startUpdateScheduler(): void {
  if (intervalId) return;
  intervalId = setInterval(checkAndRun, CHECK_INTERVAL_MS);
  console.log("[update-scheduler] Started");
}

export function stopUpdateScheduler(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
  console.log("[update-scheduler] Stopped");
}
