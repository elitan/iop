import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoModeBlockedMessage, isDemoMode } from "@/lib/demo-mode";
import { generateCode, getAuthCodeExpiry, hashOAuthToken } from "@/lib/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type" },
      { status: 400 },
    );
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
      },
      { status: 400 },
    );
  }

  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method supported",
      },
      { status: 400 },
    );
  }

  const client = await db
    .selectFrom("oauthClients")
    .selectAll()
    .where("clientId", "=", clientId)
    .executeTakeFirst();

  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  const registeredUris: string[] = JSON.parse(client.redirectUris);
  if (!registeredUris.includes(redirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "redirect_uri not registered",
      },
      { status: 400 },
    );
  }

  const clientName = client.clientName ?? "Unknown Application";
  const authorizeUrl = url.toString();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize - Frost</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px; max-width: 400px; width: 100%; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #a3a3a3; margin-bottom: 24px; }
    .app-name { color: #fff; font-weight: 500; }
    .buttons { display: flex; gap: 12px; }
    button { flex: 1; padding: 10px 16px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; }
    .approve { background: #fff; color: #0a0a0a; }
    .approve:hover { background: #e5e5e5; }
    .deny { background: #262626; color: #e5e5e5; }
    .deny:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize Access</h1>
    <p><span class="app-name">${escapeHtml(clientName)}</span> wants to access your Frost instance.</p>
    <div class="buttons">
      <form method="POST" action="${escapeHtml(authorizeUrl)}" style="flex:1;display:flex;">
        <input type="hidden" name="action" value="deny">
        <button type="submit" class="deny" style="flex:1">Deny</button>
      </form>
      <form method="POST" action="${escapeHtml(authorizeUrl)}" style="flex:1;display:flex;">
        <input type="hidden" name="action" value="approve">
        <button type="submit" class="approve" style="flex:1">Approve</button>
      </form>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: getDemoModeBlockedMessage("oauth authorization"),
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const formData = await request.formData();
  const action = formData.get("action");

  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method") ?? "S256";
  const resource = url.searchParams.get("resource");

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (codeChallengeMethod !== "S256") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method supported",
      },
      { status: 400 },
    );
  }

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Invalid action",
      },
      { status: 400 },
    );
  }

  const client = await db
    .selectFrom("oauthClients")
    .selectAll()
    .where("clientId", "=", clientId)
    .executeTakeFirst();

  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  const registeredUris: string[] = JSON.parse(client.redirectUris);
  if (!registeredUris.includes(redirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "redirect_uri not registered",
      },
      { status: 400 },
    );
  }

  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Invalid redirect URI",
      },
      { status: 400 },
    );
  }

  if (action === "deny") {
    redirect.searchParams.set("error", "access_denied");
    if (state) redirect.searchParams.set("state", state);
    return NextResponse.redirect(redirect.toString(), 302);
  }

  const code = generateCode();
  const codeHash = hashOAuthToken(code);

  await db
    .insertInto("oauthCodes")
    .values({
      id: nanoid(),
      codeHash,
      clientId,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      resource,
      expiresAt: getAuthCodeExpiry(),
    })
    .execute();

  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), 302);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
