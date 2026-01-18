import { promises as dns } from "node:dns";
import { NextResponse } from "next/server";
import { setSetting } from "@/lib/auth";
import { configureDomain, isCaddyRunning } from "@/lib/caddy";

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

export async function POST(request: Request) {
  const body = await request.json();
  const { domain, email, staging = false } = body;

  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const caddyRunning = await isCaddyRunning();
  if (!caddyRunning) {
    return NextResponse.json(
      { error: "Caddy is not running. Please ensure Caddy is installed." },
      { status: 503 },
    );
  }

  const dnsValid = await verifyDns(domain);
  if (!dnsValid) {
    return NextResponse.json(
      {
        error:
          "DNS not configured correctly. Domain must point to this server.",
      },
      { status: 400 },
    );
  }

  try {
    await configureDomain(domain, email, staging);

    await setSetting("domain", domain);
    await setSetting("email", email);
    await setSetting("ssl_enabled", "pending");
    await setSetting("ssl_staging", staging ? "true" : "false");

    return NextResponse.json({ success: true, status: "pending" });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to enable SSL",
      },
      { status: 500 },
    );
  }
}
