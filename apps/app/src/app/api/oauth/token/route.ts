import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateAccessToken,
  generateRefreshToken,
  getAccessTokenExpiry,
  getAccessTokenTtlSeconds,
  hashOAuthToken,
  parseOAuthBody,
  verifyPKCE,
} from "@/lib/oauth";

export async function POST(request: Request) {
  const body = await parseOAuthBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(body);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(body);
  }

  return NextResponse.json(
    { error: "unsupported_grant_type" },
    { status: 400 },
  );
}

async function handleAuthorizationCode(body: Record<string, string>) {
  const { code, redirect_uri, client_id, code_verifier } = body;

  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
      },
      { status: 400 },
    );
  }

  const codeHash = hashOAuthToken(code);
  const codeRecord = await db
    .selectFrom("oauthCodes")
    .selectAll()
    .where("codeHash", "=", codeHash)
    .executeTakeFirst();

  if (!codeRecord) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Invalid authorization code",
      },
      { status: 400 },
    );
  }

  if (codeRecord.used) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code already used",
      },
      { status: 400 },
    );
  }

  if (new Date(codeRecord.expiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code expired",
      },
      { status: 400 },
    );
  }

  if (codeRecord.clientId !== client_id) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Client mismatch" },
      { status: 400 },
    );
  }

  if (codeRecord.redirectUri !== redirect_uri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Redirect URI mismatch" },
      { status: 400 },
    );
  }

  if (!verifyPKCE(code_verifier, codeRecord.codeChallenge)) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 },
    );
  }

  await db
    .updateTable("oauthCodes")
    .set({ used: 1 })
    .where("id", "=", codeRecord.id)
    .execute();

  return issueTokenPair(client_id);
}

async function handleRefreshToken(body: Record<string, string>) {
  const { refresh_token, client_id } = body;

  if (!refresh_token || !client_id) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
      },
      { status: 400 },
    );
  }

  const refreshHash = hashOAuthToken(refresh_token);
  const tokenRecord = await db
    .selectFrom("oauthTokens")
    .selectAll()
    .where("refreshTokenHash", "=", refreshHash)
    .where("clientId", "=", client_id)
    .executeTakeFirst();

  if (!tokenRecord) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid refresh token" },
      { status: 400 },
    );
  }

  if (new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
    await db
      .deleteFrom("oauthTokens")
      .where("id", "=", tokenRecord.id)
      .execute();
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Refresh token expired" },
      { status: 400 },
    );
  }

  await db.deleteFrom("oauthTokens").where("id", "=", tokenRecord.id).execute();

  return issueTokenPair(client_id);
}

async function issueTokenPair(clientId: string) {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const expiresAt = getAccessTokenExpiry();
  const expiresIn = getAccessTokenTtlSeconds();

  await db
    .insertInto("oauthTokens")
    .values({
      id: nanoid(),
      accessTokenHash: hashOAuthToken(accessToken),
      refreshTokenHash: hashOAuthToken(refreshToken),
      clientId,
      expiresAt,
    })
    .execute();

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    refresh_token: refreshToken,
    expires_in: expiresIn,
  });
}
