export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/migrate");
    runMigrations();
    console.log("[startup] migrations: ok");

    const { persistUpdateResult } = await import("./lib/updater");
    await persistUpdateResult();

    const { startMetricsCollector } = await import("./lib/metrics-collector");
    startMetricsCollector();
    console.log("[startup] metrics collector: started");

    const { startCleanupScheduler } = await import("./lib/cleanup-scheduler");
    startCleanupScheduler();
    console.log("[startup] cleanup scheduler: started");

    const { syncCaddyConfig } = await import("./lib/domains");
    try {
      const synced = await syncCaddyConfig();
      console.log(
        `[startup] caddy sync: ${synced ? "ok" : "skipped (no domains)"}`,
      );
    } catch (err) {
      console.error("[startup] caddy sync: failed", err);
    }
  }
}
