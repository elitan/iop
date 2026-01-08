import { createHash, createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DEFAULT_SECRET = "frost-default-secret-change-me";
const JWT_SECRET = process.env.FROST_JWT_SECRET || DEFAULT_SECRET;

function getApiKey(): string | null {
  const secret = process.env.FROST_JWT_SECRET;
  if (!secret || secret === DEFAULT_SECRET) return null;
  return createHash("sha256")
    .update(`${secret}frost-api-key`)
    .digest("hex")
    .slice(0, 32);
}

function verifyApiToken(token: string): boolean {
  const apiKey = getApiKey();
  if (!apiKey) return false;
  return token === apiKey;
}

function verifySessionToken(token: string): boolean {
  const [data, signature] = token.split(".");
  if (!data || !signature) return false;

  const expectedSignature = createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64url");

  if (signature !== expectedSignature) return false;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname === "/api/github/webhook"
  ) {
    return NextResponse.next();
  }

  const apiToken = request.headers.get("x-frost-token");
  if (apiToken && verifyApiToken(apiToken)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("frost_session")?.value;

  if (sessionToken && verifySessionToken(sessionToken)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
