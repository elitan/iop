import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/auth";
import { createWildcardARecord } from "@/lib/cloudflare";
import { getServerIp, syncCaddyConfig } from "@/lib/domains";

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

  if (!wildcardDomain) {
    return NextResponse.json(
      { error: "wildcardDomain is required" },
      { status: 400 },
    );
  }

  if (!dnsProvider) {
    return NextResponse.json(
      { error: "dnsProvider is required" },
      { status: 400 },
    );
  }

  if (!dnsApiToken) {
    return NextResponse.json(
      { error: "dnsApiToken is required" },
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

  try {
    await setSetting("wildcard_domain", domainWithoutWildcard);
    await setSetting("dns_provider", dnsProvider);
    await setSetting("dns_api_token", dnsApiToken);

    try {
      await syncCaddyConfig();
    } catch {}

    return NextResponse.json({ success: true, dnsWarning });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save wildcard settings",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await setSetting("wildcard_domain", "");
    await setSetting("dns_provider", "");
    await setSetting("dns_api_token", "");

    try {
      await syncCaddyConfig();
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete wildcard settings",
      },
      { status: 500 },
    );
  }
}
