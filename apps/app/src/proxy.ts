import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSetupComplete, verifyApiToken } from "./lib/auth";

const DEFAULT_SECRET = "frost-default-secret-change-me";
const JWT_SECRET = process.env.FROST_JWT_SECRET || DEFAULT_SECRET;

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

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/",
  "/api/setup",
  "/api/dev/reset-setup",
  "/api/health",
  "/api/github/webhook",
  "/api/openapi.json",
  "/api/docs",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const apiToken = request.headers.get("x-frost-token");
  if (apiToken && (await verifyApiToken(apiToken))) {
    return NextResponse.next();
  }

  if (!(await isSetupComplete())) {
    if (isApi) {
      return NextResponse.json(
        { error: "setup not complete" },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const sessionToken = request.cookies.get("frost_session")?.value;
  if (sessionToken && verifySessionToken(sessionToken)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
