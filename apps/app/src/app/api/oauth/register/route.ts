import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoModeBlockedMessage, isDemoMode } from "@/lib/demo-mode";

const REGISTER_WINDOW_MS = 60 * 1000;
const REGISTER_MAX_REQUESTS = 20;
const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME_LENGTH = 120;

const g = globalThis as typeof globalThis & {
  __oauthRegisterLimit?: Map<string, { count: number; resetAt: number }>;
};
if (!g.__oauthRegisterLimit) {
  g.__oauthRegisterLimit = new Map();
}
const registerLimit = g.__oauthRegisterLimit;

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: getDemoModeBlockedMessage("oauth registration"),
      },
      { status: 400 },
    );
  }

  const clientAddress = getClientAddress(request);
  if (isRateLimited(clientAddress)) {
    return NextResponse.json(
      {
        error: "slow_down",
        error_description: "Too many registration requests",
      },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name : null;
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  const uniqueRedirectUris = [...new Set(redirectUris)];

  if (clientName && clientName.length > MAX_CLIENT_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "client_name too long",
      },
      { status: 400 },
    );
  }

  if (uniqueRedirectUris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "redirect_uris required",
      },
      { status: 400 },
    );
  }

  if (uniqueRedirectUris.length > MAX_REDIRECT_URIS) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "too many redirect_uris",
      },
      { status: 400 },
    );
  }

  if (!uniqueRedirectUris.every(isValidRedirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "redirect_uris must be valid http/https URLs",
      },
      { status: 400 },
    );
  }

  const id = nanoid();
  const clientId = `frost_client_${randomBytes(16).toString("hex")}`;

  await db
    .insertInto("oauthClients")
    .values({
      id,
      clientId,
      clientName,
      redirectUris: JSON.stringify(uniqueRedirectUris),
    })
    .execute();

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: uniqueRedirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}

function getClientAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

function isRateLimited(clientAddress: string): boolean {
  const now = Date.now();
  const entry = registerLimit.get(clientAddress);

  if (!entry || entry.resetAt <= now) {
    registerLimit.set(clientAddress, {
      count: 1,
      resetAt: now + REGISTER_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= REGISTER_MAX_REQUESTS) return true;

  registerLimit.set(clientAddress, {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  });
  return false;
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
