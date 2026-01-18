import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import {
  exchangeCodeForCredentials,
  saveGitHubAppCredentials,
} from "@/lib/github";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const domain = await getSetting("domain");
  const baseUrl = domain ? `https://${domain}` : url.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/github?error=missing_code", baseUrl),
    );
  }

  try {
    const data = await exchangeCodeForCredentials(code);

    await saveGitHubAppCredentials({
      appId: String(data.id),
      slug: data.slug,
      name: data.name,
      privateKey: data.pem,
      webhookSecret: data.webhook_secret,
      clientId: data.client_id,
      clientSecret: data.client_secret,
    });

    const installUrl = `https://github.com/apps/${data.slug}/installations/new`;
    return NextResponse.redirect(installUrl);
  } catch (err: any) {
    console.error("GitHub callback error:", err);
    return NextResponse.redirect(
      new URL(
        `/settings/github?error=${encodeURIComponent(err.message)}`,
        baseUrl,
      ),
    );
  }
}
