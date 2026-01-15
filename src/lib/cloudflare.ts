import psl from "psl";

const CF_API = "https://api.cloudflare.com/client/v4";

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: T;
}

interface Zone {
  id: string;
  name: string;
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

export function getRootDomain(domain: string): string {
  const rootDomain = psl.get(domain);
  if (!rootDomain) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return rootDomain;
}

async function cfFetch<T>(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = (await res.json()) as CloudflareResponse<T>;

  if (!data.success) {
    const msg = data.errors?.[0]?.message || "Cloudflare API error";
    throw new Error(msg);
  }

  return data.result;
}

async function getZoneId(token: string, domain: string): Promise<string> {
  const rootDomain = getRootDomain(domain);
  const zones = await cfFetch<Zone[]>(
    token,
    `/zones?name=${encodeURIComponent(rootDomain)}`,
  );

  if (zones.length === 0) {
    throw new Error(`Zone not found for domain: ${rootDomain}`);
  }

  return zones[0].id;
}

async function findDnsRecord(
  token: string,
  zoneId: string,
  name: string,
): Promise<DnsRecord | null> {
  const records = await cfFetch<DnsRecord[]>(
    token,
    `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`,
  );
  return records.length > 0 ? records[0] : null;
}

export async function createWildcardARecord(
  token: string,
  wildcardDomain: string,
  serverIp: string,
): Promise<void> {
  const zoneId = await getZoneId(token, wildcardDomain);
  const recordName = `*.${wildcardDomain}`;

  const existing = await findDnsRecord(token, zoneId, recordName);

  if (existing) {
    if (existing.content === serverIp) {
      return;
    }
    await cfFetch(token, `/zones/${zoneId}/dns_records/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: serverIp }),
    });
  } else {
    await cfFetch(token, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: recordName,
        content: serverIp,
        ttl: 1,
        proxied: false,
      }),
    });
  }
}
