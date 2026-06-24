import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isSetupComplete,
  verifyApiToken,
  verifySessionToken,
} from "./lib/auth";
import { isDemoMode } from "./lib/demo-mode";
import { verifyOAuthToken } from "./lib/oauth";
import { isPublicPath } from "./lib/public-paths";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const demoMode = isDemoMode();

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (demoMode) {
    const setupComplete = await isSetupComplete();
    if (!setupComplete) {
      if (isApi) {
        return NextResponse.json(
          { error: "setup not complete" },
          { status: 503 },
        );
      }
      return NextResponse.redirect(new URL("/setup", request.url));
    }
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
