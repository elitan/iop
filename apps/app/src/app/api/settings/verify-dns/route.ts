import { promises as dns } from "node:dns";
import { NextResponse } from "next/server";

async function getServerIp(): Promise<string> {
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

export async function POST(request: Request) {
  const body = await request.json();
  const { domain } = body;

  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  try {
    const [serverIp, domainIps] = await Promise.all([
      getServerIp(),
      resolveDomain(domain),
    ]);

    const valid = domainIps.includes(serverIp);

    return NextResponse.json({
      valid,
      serverIp,
      domainIp: domainIps[0] || null,
      allDomainIps: domainIps,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DNS check failed" },
      { status: 500 },
    );
  }
}
