import { promises as dns } from "node:dns";
import { nanoid } from "nanoid";
import { getSetting } from "./auth";
import { acmeIssuer, type DnsConfig, dnsAcmeIssuer } from "./caddy";
import { db } from "./db";

const CADDY_ADMIN = "http://localhost:2019";

export interface DomainInput {
  domain: string;
  type?: "proxy" | "redirect";
  redirectTarget?: string;
  redirectCode?: 301 | 307;
}

export interface DnsStatus {
  valid: boolean;
  serverIp: string;
  domainIp: string | null;
  errorType?: "no_record" | "wrong_ip";
}

export async function addDomain(
  serviceId: string,
  environmentId: string,
  input: DomainInput,
) {
  const { domain, type = "proxy", redirectTarget, redirectCode = 301 } = input;

  const id = nanoid();
  const now = Date.now();

  await db
    .insertInto("domains")
    .values({
      id,
      serviceId: serviceId,
      environmentId: environmentId,
      domain: domain.toLowerCase(),
      type,
      redirectTarget: type === "redirect" ? redirectTarget : null,
      redirectCode: type === "redirect" ? redirectCode : null,
      dnsVerified: false,
      sslStatus: "pending",
      createdAt: now,
    })
    .execute();

  const result = await getDomain(id);
  if (!result) {
    throw new Error("Failed to create domain");
  }
  return result;
}

export async function getDomain(id: string) {
  return db
    .selectFrom("domains")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function getDomainByName(domain: string) {
  return db
    .selectFrom("domains")
    .selectAll()
    .where("domain", "=", domain.toLowerCase())
    .executeTakeFirst();
}

export async function getDomainsForService(serviceId: string) {
  return db
    .selectFrom("domains")
    .selectAll()
    .where("serviceId", "=", serviceId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function updateDomain(
  id: string,
  updates: Partial<{
    type: "proxy" | "redirect";
    redirectTarget: string | null;
    redirectCode: 301 | 307;
    dnsVerified: boolean;
    sslStatus: "pending" | "active" | "failed";
  }>,
) {
  const setValues: Record<string, unknown> = {};

  if (updates.type !== undefined) setValues.type = updates.type;
  if (updates.redirectTarget !== undefined)
    setValues.redirectTarget = updates.redirectTarget;
  if (updates.redirectCode !== undefined)
    setValues.redirectCode = updates.redirectCode;
  if (updates.dnsVerified !== undefined)
    setValues.dnsVerified = updates.dnsVerified ? 1 : 0;
  if (updates.sslStatus !== undefined) setValues.sslStatus = updates.sslStatus;

  if (Object.keys(setValues).length > 0) {
    await db
      .updateTable("domains")
      .set(setValues)
      .where("id", "=", id)
      .execute();
  }

  const result = await getDomain(id);
  if (!result) {
    throw new Error("Domain not found after update");
  }
  return result;
}

export async function removeDomain(id: string) {
  await db.deleteFrom("domains").where("id", "=", id).execute();
}

export async function getSystemDomainForService(serviceId: string) {
  return (
    (await db
      .selectFrom("domains")
      .selectAll()
      .where("serviceId", "=", serviceId)
      .where("isSystem", "=", true)
      .executeTakeFirst()) ?? null
  );
}

export async function backfillWildcardDomains(): Promise<number> {
  if (process.env.NODE_ENV === "development") return 0;

  const wildcardBase = await getSetting("wildcard_domain");
  if (!wildcardBase) return 0;

  const services = await db
    .selectFrom("services")
    .innerJoin("environments", "environments.id", "services.environmentId")
    .innerJoin("projects", "projects.id", "environments.projectId")
    .select([
      "services.id",
      "services.environmentId",
      "services.hostname",
      "projects.hostname as projectHostname",
      "environments.name as environmentName",
      "environments.type as environmentType",
    ])
    .where("services.serviceType", "!=", "database")
    .where("services.hostname", "is not", null)
    .where("projects.hostname", "is not", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("domains")
            .whereRef("domains.serviceId", "=", "services.id")
            .where("domains.isSystem", "=", true)
            .select("domains.id"),
        ),
      ),
    )
    .execute();

  let count = 0;
  for (const row of services) {
    if (!row.hostname || !row.projectHostname) continue;
    const envName =
      row.environmentType !== "production" ? row.environmentName : undefined;
    await createWildcardDomain(
      row.id,
      row.environmentId,
      row.hostname,
      row.projectHostname,
      envName,
    );
    count++;
  }

  return count;
}

export async function createWildcardDomain(
  serviceId: string,
  environmentId: string,
  serviceHostname: string,
  projectHostname: string,
  environmentName?: string,
): Promise<void> {
  if (process.env.NODE_ENV === "development") return;

  const wildcardBase = await getSetting("wildcard_domain");
  if (!wildcardBase) return;

  const slug = environmentName
    ? `${serviceHostname}-${environmentName}-${projectHostname}`
    : `${serviceHostname}-${projectHostname}`;
  let domain: string | null = null;

  for (let i = 0; i < 10; i++) {
    const candidate =
      i === 0 ? `${slug}.${wildcardBase}` : `${slug}-${i + 1}.${wildcardBase}`;
    const existing = await getDomainByName(candidate);
    if (!existing) {
      domain = candidate;
      break;
    }
  }

  if (!domain) {
    console.error(
      "Could not generate unique wildcard domain after 10 attempts",
    );
    return;
  }

  const id = nanoid();
  const now = Date.now();

  await db
    .insertInto("domains")
    .values({
      id,
      serviceId,
      environmentId,
      domain,
      type: "proxy",
      redirectTarget: null,
      redirectCode: null,
      dnsVerified: true,
      sslStatus: "active",
      createdAt: now,
      isSystem: true,
    })
    .execute();

  await syncCaddyConfig();
}

export async function getServerIp(): Promise<string> {
  const services = ["https://api.ipify.org", "https://ifconfig.me/ip"];

  for (const url of services) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const ip = await res.text();
        return ip.trim();
      }
    } catch {}
  }

  throw new Error("Could not determine server IP");
}

async function resolveDomain(domain: string): Promise<string[]> {
  try {
    return await dns.resolve4(domain);
  } catch {
    return [];
  }
}

export async function verifyDomainDns(domain: string): Promise<DnsStatus> {
  const [serverIp, domainIps] = await Promise.all([
    getServerIp(),
    resolveDomain(domain),
  ]);

  const valid = domainIps.includes(serverIp);
  const errorType = valid
    ? undefined
    : domainIps.length === 0
      ? "no_record"
      : "wrong_ip";

  return { valid, serverIp, domainIp: domainIps[0] ?? null, errorType };
}

interface DomainRoute {
  domain: string;
  type: "proxy" | "redirect" | "frost-admin";
  hostPort?: number;
  redirectTarget?: string;
  redirectCode?: number;
  requestTimeout?: number;
}

interface WildcardConfig {
  domain: string;
  dnsConfig: DnsConfig;
}

function buildCaddyConfig(
  routes: DomainRoute[],
  email: string,
  staging: boolean,
  wildcardConfig?: WildcardConfig,
) {
  const httpsRoutes: unknown[] = [];
  const httpOnlyDomains: string[] = [];
  const wildcardDomains: string[] = [];

  for (const route of routes) {
    if (wildcardConfig && route.domain.endsWith(`.${wildcardConfig.domain}`)) {
      wildcardDomains.push(route.domain);
    } else {
      httpOnlyDomains.push(route.domain);
    }

    if (route.type === "frost-admin" || route.type === "proxy") {
      const dial =
        route.type === "frost-admin"
          ? "localhost:3000"
          : `localhost:${route.hostPort}`;

      const reverseProxyHandler: Record<string, unknown> = {
        handler: "reverse_proxy",
        upstreams: [{ dial }],
      };

      if (route.requestTimeout) {
        reverseProxyHandler.transport = {
          protocol: "http",
          response_header_timeout: route.requestTimeout * 1_000_000_000,
        };
      }

      httpsRoutes.push({
        match: [{ host: [route.domain] }],
        handle: [reverseProxyHandler],
      });
    } else if (route.type === "redirect") {
      httpsRoutes.push({
        match: [{ host: [route.domain] }],
        handle: [
          {
            handler: "static_response",
            status_code: route.redirectCode || 301,
            headers: {
              Location: [`https://${route.redirectTarget}{http.request.uri}`],
            },
          },
        ],
      });
    }
  }

  const policies: unknown[] = [];

  if (wildcardConfig) {
    policies.push({
      subjects: [`*.${wildcardConfig.domain}`],
      issuers: [dnsAcmeIssuer(email, wildcardConfig.dnsConfig, staging)],
    });
  }

  if (httpOnlyDomains.length > 0) {
    policies.push({
      subjects: httpOnlyDomains,
      issuers: [acmeIssuer(email, staging)],
    });
  }

  if (wildcardConfig) {
    httpsRoutes.push({
      match: [{ host: [`*.${wildcardConfig.domain}`] }],
      handle: [
        {
          handler: "static_response",
          status_code: 404,
          body: "Service not found",
        },
      ],
    });
  }

  return {
    apps: {
      http: {
        servers: {
          https: {
            listen: [":443"],
            routes: httpsRoutes,
          },
          http: {
            listen: [":80"],
            routes: [
              {
                handle: [
                  {
                    handler: "static_response",
                    status_code: 301,
                    headers: {
                      Location: [
                        "https://{http.request.host}{http.request.uri}",
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      tls:
        policies.length > 0
          ? {
              automation: {
                policies,
              },
            }
          : undefined,
    },
  };
}

interface SyncResult {
  synced: boolean;
  frostDomain?: string;
  serviceDomains: number;
  staging: boolean;
}

export async function syncCaddyConfig(): Promise<SyncResult> {
  const frostDomain = await getSetting("domain");
  const email = await getSetting("email");
  const staging = (await getSetting("ssl_staging")) === "true";

  const wildcardDomain = await getSetting("wildcard_domain");
  const dnsProvider = await getSetting("dns_provider");
  const dnsApiToken = await getSetting("dns_api_token");

  if (!email) {
    return { synced: false, serviceDomains: 0, staging };
  }

  const verifiedDomains = await db
    .selectFrom("domains")
    .innerJoin("services", "services.id", "domains.serviceId")
    .innerJoin("deployments", (join) =>
      join
        .onRef("deployments.serviceId", "=", "services.id")
        .on("deployments.status", "=", "running"),
    )
    .select([
      "domains.domain",
      "domains.type",
      "domains.redirectTarget",
      "domains.redirectCode",
      "deployments.hostPort",
      "services.requestTimeout",
    ])
    .where("domains.dnsVerified", "=", true)
    .execute();

  const routes: DomainRoute[] = [];

  if (frostDomain) {
    routes.push({
      domain: frostDomain,
      type: "frost-admin",
    });
  }

  for (const d of verifiedDomains) {
    if (d.type === "proxy" && d.hostPort) {
      routes.push({
        domain: d.domain,
        type: "proxy",
        hostPort: d.hostPort,
        requestTimeout: d.requestTimeout ?? undefined,
      });
    } else if (d.type === "redirect" && d.redirectTarget) {
      routes.push({
        domain: d.domain,
        type: "redirect",
        redirectTarget: d.redirectTarget,
        redirectCode: d.redirectCode || 301,
      });
    }
  }

  if (routes.length === 0) {
    return { synced: false, serviceDomains: 0, staging };
  }

  const wildcardConfig: WildcardConfig | undefined =
    wildcardDomain && dnsProvider === "cloudflare" && dnsApiToken
      ? {
          domain: wildcardDomain,
          dnsConfig: { provider: dnsProvider, apiToken: dnsApiToken },
        }
      : undefined;

  const config = buildCaddyConfig(routes, email, staging, wildcardConfig);

  const res = await fetch(`${CADDY_ADMIN}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to sync Caddy config: ${text}`);
  }

  const serviceDomains = verifiedDomains.length;
  return {
    synced: true,
    frostDomain: frostDomain ?? undefined,
    serviceDomains,
    staging,
  };
}
