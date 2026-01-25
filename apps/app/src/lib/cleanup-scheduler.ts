import { getCleanupSettings, startCleanupJob } from "./cleanup";

const CHECK_INTERVAL_MS = 60 * 1000;
const CLEANUP_HOUR = 3;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastCleanupDate: string | null = null;

async function checkAndRun(): Promise<void> {
  try {
    const settings = await getCleanupSettings();
    if (!settings.enabled) return;

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (now.getHours() === CLEANUP_HOUR && lastCleanupDate !== today) {
      lastCleanupDate = today;
      await startCleanupJob();
      console.log("[cleanup-scheduler] Started daily cleanup");
    }
  } catch (err) {
    console.error("[cleanup-scheduler] Error:", err);
  }
}

export function startCleanupScheduler(): void {
  if (intervalId) return;
  intervalId = setInterval(checkAndRun, CHECK_INTERVAL_MS);
  console.log(
    "[cleanup-scheduler] Started (checks every minute, runs at 3 AM)",
  );
}

export function stopCleanupScheduler(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
  console.log("[cleanup-scheduler] Stopped");
}
