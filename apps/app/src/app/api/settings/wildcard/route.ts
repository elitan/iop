import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/auth";
import { createWildcardARecord } from "@/lib/cloudflare";
import {
  backfillWildcardDomains,
  getServerIp,
  syncCaddyConfig,
} from "@/lib/domains";

export async function GET() {
  const [wildcardDomain, dnsProvider, dnsApiToken] = await Promise.all([
    getSetting("wildcard_domain"),
    getSetting("dns_provider"),
    getSetting("dns_api_token"),
  ]);

  return NextResponse.json({
    wildcardDomain,
    dnsProvider,
    configured: Boolean(wildcardDomain && dnsProvider && dnsApiToken),
    hasToken: Boolean(dnsApiToken),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { wildcardDomain, dnsProvider, dnsApiToken } = body;

  if (!wildcardDomain || !dnsProvider || !dnsApiToken) {
    const missing = [
      !wildcardDomain && "wildcardDomain",
      !dnsProvider && "dnsProvider",
      !dnsApiToken && "dnsApiToken",
    ].filter(Boolean)[0];
    return NextResponse.json(
      { error: `${missing} is required` },
      { status: 400 },
    );
  }

  if (dnsProvider !== "cloudflare") {
    return NextResponse.json(
      { error: "Only cloudflare is supported as DNS provider" },
      { status: 400 },
    );
  }

  const domainWithoutWildcard = wildcardDomain.replace(/^\*\./, "");

  let dnsWarning: string | undefined;
  try {
    const serverIp = await getServerIp();
    await createWildcardARecord(dnsApiToken, domainWithoutWildcard, serverIp);
  } catch (error) {
    dnsWarning =
      error instanceof Error ? error.message : "DNS record creation failed";
  }

  await setSetting("wildcard_domain", domainWithoutWildcard);
  await setSetting("dns_provider", dnsProvider);
  await setSetting("dns_api_token", dnsApiToken);

  const backfilledCount = await backfillWildcardDomains();

  await syncCaddyConfig().catch(() => {});

  return NextResponse.json({ success: true, dnsWarning, backfilledCount });
}

export async function DELETE() {
  await setSetting("wildcard_domain", "");
  await setSetting("dns_provider", "");
  await setSetting("dns_api_token", "");

  await syncCaddyConfig().catch(() => {});

  return NextResponse.json({ success: true });
}
