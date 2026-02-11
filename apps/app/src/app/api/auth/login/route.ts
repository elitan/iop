import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAdminPasswordHash,
  isDevMode,
  isSetupComplete,
  verifyDevPassword,
  verifyPassword,
} from "@/lib/auth";
import { DEMO_MODE_LIMITS, isDemoMode } from "@/lib/demo-mode";

type LoginRateLimitEntry = {
  count: number;
  resetAt: number;
};

const g = globalThis as typeof globalThis & {
  __demoLoginRateLimit?: Map<string, LoginRateLimitEntry>;
};

if (!g.__demoLoginRateLimit) {
  g.__demoLoginRateLimit = new Map();
}

const demoLoginRateLimit = g.__demoLoginRateLimit;

export async function POST(request: Request) {
  const demoMode = isDemoMode();
  const clientAddress = getClientAddress(request);

  if (demoMode && isRateLimited(clientAddress)) {
    return NextResponse.json({ error: "too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json(
      { error: "password is required" },
      { status: 400 },
    );
  }

  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    return NextResponse.json({ error: "setup not complete" }, { status: 503 });
  }

  const hash = await getAdminPasswordHash();
  const validHash = hash && (await verifyPassword(password, hash));
  const validDev = isDevMode() && (await verifyDevPassword(password));

  if (!validHash && !validDev) {
    if (demoMode) {
      recordRateLimitFailure(clientAddress);
    }
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  if (demoMode) {
    demoLoginRateLimit.delete(clientAddress);
  }

  const token = createSessionToken();
  const response = NextResponse.json({ success: true });
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttpsRequest =
    forwardedProto === "https" || request.url.startsWith("https://");

  response.cookies.set("frost_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development" && isHttpsRequest,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}

function getClientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const addresses = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const last = addresses[addresses.length - 1];
    if (last) return last;
  }

  return "unknown";
}

function isRateLimited(clientAddress: string): boolean {
  const now = Date.now();
  const entry = demoLoginRateLimit.get(clientAddress);
  if (!entry || entry.resetAt <= now) {
    demoLoginRateLimit.delete(clientAddress);
    return false;
  }

  return entry.count >= DEMO_MODE_LIMITS.loginMaxAttemptsPerWindow;
}

function recordRateLimitFailure(clientAddress: string): void {
  if (demoLoginRateLimit.size >= 256) {
    pruneExpiredRateLimitEntries();
  }

  const now = Date.now();
  const entry = demoLoginRateLimit.get(clientAddress);
  const isNewWindow = !entry || entry.resetAt <= now;
  const count = isNewWindow ? 1 : entry.count + 1;
  const resetAt = isNewWindow
    ? now + DEMO_MODE_LIMITS.loginWindowMs
    : entry.resetAt;
  demoLoginRateLimit.set(clientAddress, {
    count,
    resetAt,
  });
}

function pruneExpiredRateLimitEntries(): void {
  const now = Date.now();
  for (const [clientAddress, entry] of demoLoginRateLimit.entries()) {
    if (entry.resetAt <= now) {
      demoLoginRateLimit.delete(clientAddress);
    }
  }
}
