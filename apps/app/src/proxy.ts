import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isSetupComplete,
  verifyApiToken,
  verifySessionToken,
} from "./lib/auth";
import { verifyOAuthToken } from "./lib/oauth";

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
  "/.well-known/",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
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

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7);
    if (await verifyOAuthToken(bearerToken)) {
      return NextResponse.next();
    }
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
