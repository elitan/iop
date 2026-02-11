import {
  getCleanupSettings,
  startCleanupJob,
  updateCleanupSettings,
} from "@/lib/cleanup";
import { assertDemoWriteAllowed } from "./demo-guards";
import { os } from "./orpc";

function formatSettings(
  settings: Awaited<ReturnType<typeof getCleanupSettings>>,
) {
  return {
    enabled: settings.enabled,
    schedule: "daily" as const,
    retentionDays: settings.keepImages,
    running: settings.running,
    lastRun: settings.lastRun,
    lastResult: settings.lastResult
      ? JSON.stringify(settings.lastResult)
      : null,
  };
}

export const cleanup = {
  get: os.cleanup.get.handler(async () => {
    const settings = await getCleanupSettings();
    return formatSettings(settings);
  }),

  update: os.cleanup.update.handler(async ({ input }) => {
    assertDemoWriteAllowed("cleanup changes");

    await updateCleanupSettings({
      enabled: input.enabled,
      keepImages: input.retentionDays,
    });
    const settings = await getCleanupSettings();
    return formatSettings(settings);
  }),

  runStatus: os.cleanup.runStatus.handler(async () => {
    const settings = await getCleanupSettings();
    return {
      running: settings.running,
      lastRun: settings.lastRun,
      result: settings.lastResult ? JSON.stringify(settings.lastResult) : null,
    };
  }),

  runStart: os.cleanup.runStart.handler(async () => {
    assertDemoWriteAllowed("manual cleanup");

    const started = await startCleanupJob();
    if (!started) {
      throw new Error("Cleanup already running");
    }
    return { started: true };
  }),
};
