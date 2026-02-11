import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import { getDemoModeBlockedMessage, isDemoMode } from "@/lib/demo-mode";
import { fetchInstallationInfo, saveInstallation } from "@/lib/github";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const domain = await getSetting("domain");
  const baseUrl = domain ? `https://${domain}` : url.origin;

  if (isDemoMode()) {
    return NextResponse.redirect(
      new URL(
        `/settings/github?error=${encodeURIComponent(getDemoModeBlockedMessage("github setup"))}`,
        baseUrl,
      ),
    );
  }

  if (!installationId) {
    return NextResponse.redirect(
      new URL("/settings/github?error=missing_installation_id", baseUrl),
    );
  }

  try {
    const info = await fetchInstallationInfo(installationId);
    await saveInstallation({
      installationId,
      accountLogin: info.accountLogin,
      accountType: info.accountType,
    });
    return NextResponse.redirect(
      new URL("/settings/github?success=true", baseUrl),
    );
  } catch (err: any) {
    console.error("GitHub install callback error:", err);
    return NextResponse.redirect(
      new URL(
        `/settings/github?error=${encodeURIComponent(err.message)}`,
        baseUrl,
      ),
    );
  }
}
