import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import { getGitHubAppCredentials, getInstallations } from "@/lib/github";

export async function GET() {
  const domain = await getSetting("domain");
  const sslEnabled = await getSetting("ssl_enabled");
  const creds = await getGitHubAppCredentials();
  const installations = await getInstallations();

  const hasDomain = domain && sslEnabled === "true";
  const hasInstallation =
    installations.length > 0 || creds?.installationId !== null;

  return NextResponse.json({
    hasDomain,
    domain,
    connected: creds !== null,
    installed: hasInstallation,
    appName: creds?.name || null,
    appSlug: creds?.slug || null,
    installations: installations.map((i) => ({
      id: i.id,
      accountLogin: i.accountLogin,
      accountType: i.accountType,
    })),
  });
}
