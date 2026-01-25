export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/migrate");
    runMigrations();
    console.log("[startup] migrations: ok");

    const { ensureDockerNetworkConfig } = await import("./lib/docker-config");
    const dockerRestarted = await ensureDockerNetworkConfig().catch((err) => {
      console.error("[startup] docker: failed to configure network pools", err);
      return false;
    });
    console.log(
      dockerRestarted
        ? "[startup] docker: configured network pools, restarted"
        : "[startup] docker: network pools ok",
    );

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
      const result = await syncCaddyConfig();
      if (!result.synced) {
        console.log("[startup] caddy sync: skipped (no domains)");
        return;
      }
      const parts = [
        result.frostDomain,
        result.serviceDomains > 0 && `${result.serviceDomains} service domains`,
      ].filter(Boolean);
      console.log(`[startup] caddy sync: ok (${parts.join(", ")})`);
      if (result.staging) console.log("[startup] ssl: staging mode");
    } catch (err) {
      console.error("[startup] caddy sync: failed", err);
    }
  }
}
