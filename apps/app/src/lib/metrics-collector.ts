import {
  getMonitoringSnapshot,
  pruneOldMetrics,
  saveMetrics,
} from "./monitoring";

const COLLECTION_INTERVAL = 15 * 1000; // 15 seconds

let isRunning = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function collect(): Promise<void> {
  try {
    const snapshot = await getMonitoringSnapshot();
    await saveMetrics(snapshot);
    await pruneOldMetrics();
  } catch (err) {
    console.error("[metrics-collector] Error collecting metrics:", err);
  }
}

export function startMetricsCollector(): void {
  if (isRunning) return;
  isRunning = true;

  collect();

  intervalId = setInterval(collect, COLLECTION_INTERVAL);

  console.log("[metrics-collector] Started (15s interval)");
}

export function stopMetricsCollector(): void {
  if (!isRunning) return;
  isRunning = false;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log("[metrics-collector] Stopped");
}

export function isMetricsCollectorRunning(): boolean {
  return isRunning;
}
