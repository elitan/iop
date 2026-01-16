export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/migrate");
    runMigrations();

    const { persistUpdateResult } = await import("./lib/updater");
    await persistUpdateResult();

    const { startMetricsCollector } = await import("./lib/metrics-collector");
    startMetricsCollector();
  }
}
