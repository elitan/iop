import { promises as dns } from "node:dns";
import https from "node:https";
import { getSetting, setSetting } from "@/lib/auth";
import { configureDomain, isCaddyRunning, lockToDomain } from "@/lib/caddy";
import { createWildcardARecord } from "@/lib/cloudflare";
import {
  backfillWildcardDomains,
  getServerIp,
  syncCaddyConfig,
} from "@/lib/domains";
import {
  buildManifest,
  clearGitHubAppCredentials,
  getGitHubAppCredentials,
  getInstallations,
} from "@/lib/github";
import { os } from "./orpc";

async function resolveDomain(domain: string): Promise<string[]> {
  try {
    return await dns.resolve4(domain);
  } catch {
    return [];
  }
}

async function checkHttps(
  domain: string,
  rejectUnauthorized: boolean,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: domain,
        port: 443,
        method: "GET",
        timeout: 5000,
        rejectUnauthorized,
      },
      (res) => {
        resolve({ ok: true, status: res.statusCode });
      },
    );
    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

async function verifyDns(domain: string): Promise<boolean> {
  try {
    const [serverIp, domainIps] = await Promise.all([
      getServerIp(),
      dns.resolve4(domain),
    ]);
    return domainIps.includes(serverIp);
  } catch {
    return false;
  }
}

interface CloudflareVerifyResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: {
    id: string;
    status: string;
  };
}

async function verifyCloudflareToken(apiToken: string): Promise<boolean> {
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    return false;
  }

  const data = (await res.json()) as CloudflareVerifyResponse;
  return data.success && data.result?.status === "active";
}

export const settings = {
  get: os.settings.get.handler(async () => {
    const isDev = process.env.NODE_ENV === "development";

    const [domain, email, sslEnabled, serverIp] = await Promise.all([
      getSetting("domain"),
      getSetting("email"),
      getSetting("ssl_enabled"),
      isDev
        ? Promise.resolve("localhost")
        : getServerIp().catch(() => "localhost"),
    ]);

    return {
      domain,
      email,
      sslEnabled,
      serverIp,
    };
  }),

  verifyDns: os.settings.verifyDns.handler(async ({ input }) => {
    const { domain } = input;

    const [serverIp, domainIps] = await Promise.all([
      getServerIp(),
      resolveDomain(domain),
    ]);

    const valid = domainIps.includes(serverIp);

    return {
      valid,
      serverIp,
      domainIp: domainIps[0] || null,
      allDomainIps: domainIps,
    };
  }),

  verifySsl: os.settings.verifySsl.handler(async ({ input }) => {
    const { domain } = input;

    const staging = (await getSetting("ssl_staging")) === "true";

    const result = await checkHttps(domain, !staging);

    if (result.ok && result.status && result.status < 500) {
      await setSetting("ssl_enabled", "true");

      const email = await getSetting("email");
      if (email) {
        await lockToDomain(domain, email, staging);
      }

      return { working: true };
    }

    return {
      working: false,
      error: result.error || `Server returned ${result.status}`,
    };
  }),

  enableSsl: os.settings.enableSsl.handler(async ({ input }) => {
    const { domain, email, staging = false } = input;

    const caddyRunning = await isCaddyRunning();
    if (!caddyRunning) {
      throw new Error(
        "Caddy is not running. Please ensure Caddy is installed.",
      );
    }

    const dnsValid = await verifyDns(domain);
    if (!dnsValid) {
      throw new Error(
        "DNS not configured correctly. Domain must point to this server.",
      );
    }

    await configureDomain(domain, email, staging);

    await setSetting("domain", domain);
    await setSetting("email", email);
    await setSetting("ssl_enabled", "pending");
    await setSetting("ssl_staging", staging ? "true" : "false");

    return { success: true, status: "pending" };
  }),

  github: {
    get: os.settings.github.get.handler(async () => {
      const domain = await getSetting("domain");
      const sslEnabled = await getSetting("ssl_enabled");
      const creds = await getGitHubAppCredentials();
      const installations = await getInstallations();

      const hasDomain = Boolean(domain && sslEnabled === "true");
      const hasInstallation =
        installations.length > 0 || creds?.installationId !== null;

      return {
        hasDomain,
        domain,
        connected: creds !== null,
        installed: hasInstallation,
        appName: creds?.name || null,
        appSlug: creds?.slug || null,
        installations: installations.map((i) => ({
          id: Number(i.installationId),
          accountLogin: i.accountLogin,
          accountType: i.accountType,
        })),
      };
    }),

    manifest: os.settings.github.manifest.handler(async () => {
      const domain = await getSetting("domain");
      const sslEnabled = await getSetting("ssl_enabled");

      if (!domain || sslEnabled !== "true") {
        throw new Error("Domain with SSL must be configured first");
      }

      const manifest = buildManifest(domain) as Record<string, unknown>;
      return { manifest, domain };
    }),

    disconnect: os.settings.github.disconnect.handler(async () => {
      await clearGitHubAppCredentials();
      return { success: true };
    }),
  },

  wildcard: {
    get: os.settings.wildcard.get.handler(async () => {
      const [wildcardDomain, dnsProvider, dnsApiToken] = await Promise.all([
        getSetting("wildcard_domain"),
        getSetting("dns_provider"),
        getSetting("dns_api_token"),
      ]);

      return {
        wildcardDomain,
        dnsProvider,
        configured: Boolean(wildcardDomain && dnsProvider && dnsApiToken),
        hasToken: Boolean(dnsApiToken),
      };
    }),

    set: os.settings.wildcard.set.handler(async ({ input }) => {
      const { wildcardDomain, dnsProvider, dnsApiToken } = input;

      if (dnsProvider !== "cloudflare") {
        throw new Error("Only cloudflare is supported as DNS provider");
      }

      const domainWithoutWildcard = wildcardDomain.replace(/^\*\./, "");

      let dnsWarning: string | undefined;
      try {
        const serverIp = await getServerIp();
        await createWildcardARecord(
          dnsApiToken,
          domainWithoutWildcard,
          serverIp,
        );
      } catch (error) {
        dnsWarning =
          error instanceof Error ? error.message : "DNS record creation failed";
      }

      await setSetting("wildcard_domain", domainWithoutWildcard);
      await setSetting("dns_provider", dnsProvider);
      await setSetting("dns_api_token", dnsApiToken);

      const backfilledCount = await backfillWildcardDomains();

      await syncCaddyConfig().catch(() => {});

      return { success: true, dnsWarning, backfilledCount };
    }),

    delete: os.settings.wildcard.delete.handler(async () => {
      await setSetting("wildcard_domain", "");
      await setSetting("dns_provider", "");
      await setSetting("dns_api_token", "");

      await syncCaddyConfig().catch(() => {});

      return { success: true };
    }),

    test: os.settings.wildcard.test.handler(async ({ input }) => {
      const { dnsProvider, dnsApiToken } = input;

      if (dnsProvider !== "cloudflare") {
        throw new Error("Only cloudflare is supported");
      }

      try {
        const valid = await verifyCloudflareToken(dnsApiToken);

        if (!valid) {
          return { valid: false, error: "Invalid or inactive API token" };
        }

        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          error:
            error instanceof Error ? error.message : "Failed to verify token",
        };
      }
    }),
  },
};
