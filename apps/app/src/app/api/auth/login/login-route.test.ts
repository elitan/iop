import { afterEach, describe, expect, mock, test } from "bun:test";

type AuthState = {
  hash: string | null;
  setupComplete: boolean;
  validDev: boolean;
  validHash: boolean;
};

type DemoState = {
  enabled: boolean;
};

type LoginRateLimitEntry = {
  count: number;
  resetAt: number;
};

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
  value: string;
};

type JsonCall = {
  body: unknown;
  init: { status?: number } | undefined;
};

const authState: AuthState = {
  hash: "stored-hash",
  setupComplete: true,
  validDev: false,
  validHash: true,
};
const demoState: DemoState = {
  enabled: false,
};

const cookieCalls: CookieCall[] = [];
const jsonCalls: JsonCall[] = [];
const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete env.NODE_ENV;
    return;
  }
  env.NODE_ENV = value;
}

function resetState() {
  authState.hash = "stored-hash";
  authState.setupComplete = true;
  authState.validDev = false;
  authState.validHash = true;
  demoState.enabled = false;
  cookieCalls.length = 0;
  jsonCalls.length = 0;
  const g = globalThis as typeof globalThis & {
    __demoLoginRateLimit?: Map<string, LoginRateLimitEntry>;
  };
  g.__demoLoginRateLimit?.clear();
}

mock.module("next/server", () => ({
  NextResponse: {
    json: function json(body: unknown, init?: { status?: number }) {
      jsonCalls.push({ body, init });
      return {
        body,
        init,
        cookies: {
          set: function set(
            name: string,
            value: string,
            options: Record<string, unknown>,
          ) {
            cookieCalls.push({ name, options, value });
          },
        },
      };
    },
  },
}));

mock.module("@/lib/auth", () => ({
  createSessionToken: function createSessionToken() {
    return "session-token";
  },
  getAdminPasswordHash: async function getAdminPasswordHash() {
    return authState.hash;
  },
  isDevMode: function isDevMode() {
    return process.env.NODE_ENV === "development";
  },
  isSetupComplete: async function isSetupComplete() {
    return authState.setupComplete;
  },
  verifyDevPassword: async function verifyDevPassword() {
    return authState.validDev;
  },
  verifyPassword: async function verifyPassword() {
    return authState.validHash;
  },
}));

mock.module("@/lib/demo-mode", () => ({
  DEMO_MODE_LIMITS: {
    loginWindowMs: 60 * 1000,
    loginMaxAttemptsPerWindow: 2,
  },
  isDemoMode: function isDemoMode() {
    return demoState.enabled;
  },
}));

async function callLoginRoute() {
  return callLoginRouteWithConfig({
    body: { password: "secret" },
  });
}

async function callLoginRouteWithConfig(config: {
  body: Record<string, unknown>;
  headers?: HeadersInit;
  url?: string;
}) {
  const { POST } = await import("./route");
  return POST(
    new Request(config.url ?? "http://localhost/api/auth/login", {
      body: JSON.stringify(config.body),
      headers: config.headers,
      method: "POST",
    }),
  );
}

async function callLoginRouteWithBody(body: Record<string, unknown>) {
  return callLoginRouteWithConfig({ body });
}

async function callLoginRouteWithIp(
  realIp: string,
  forwardedFor: string,
): Promise<void> {
  await callLoginRouteWithConfig({
    body: { password: "secret" },
    headers: { "x-forwarded-for": forwardedFor, "x-real-ip": realIp },
  });
}

afterEach(() => {
  resetState();
  setNodeEnv(originalNodeEnv);
});

describe("login route", () => {
  test("returns 400 when password missing", async () => {
    await callLoginRouteWithBody({});

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "password is required" });
    expect(jsonCalls[0]?.init?.status).toBe(400);
    expect(cookieCalls).toHaveLength(0);
  });

  test("returns 503 when setup not complete", async () => {
    authState.setupComplete = false;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "setup not complete" });
    expect(jsonCalls[0]?.init?.status).toBe(503);
    expect(cookieCalls).toHaveLength(0);
  });

  test("returns 401 when password invalid", async () => {
    setNodeEnv("production");
    authState.validHash = false;
    authState.validDev = false;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "invalid password" });
    expect(jsonCalls[0]?.init?.status).toBe(401);
    expect(cookieCalls).toHaveLength(0);
  });

  test("sets secure false in development", async () => {
    setNodeEnv("development");
    authState.validHash = false;
    authState.validDev = true;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe("frost_session");
    expect(cookieCalls[0]?.options.secure).toBe(false);
  });

  test("sets secure true and expected options in production", async () => {
    setNodeEnv("production");

    await callLoginRouteWithConfig({
      body: { password: "secret" },
      url: "https://localhost/api/auth/login",
    });

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]).toEqual({
      name: "frost_session",
      options: {
        httpOnly: true,
        maxAge: 604800,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
      value: "session-token",
    });
  });

  test("sets secure false in production over http", async () => {
    setNodeEnv("production");

    await callLoginRoute();

    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.options.secure).toBe(false);
  });

  test("sets secure true when forwarded proto is https", async () => {
    setNodeEnv("production");

    await callLoginRouteWithConfig({
      body: { password: "secret" },
      headers: { "x-forwarded-proto": "https" },
      url: "http://localhost/api/auth/login",
    });

    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.options.secure).toBe(true);
  });

  test("uses x-real-ip for demo login rate limiting", async () => {
    setNodeEnv("production");
    demoState.enabled = true;
    authState.validHash = false;

    await callLoginRouteWithIp("198.51.100.22", "1.1.1.1");
    await callLoginRouteWithIp("198.51.100.22", "2.2.2.2");
    await callLoginRouteWithIp("198.51.100.22", "3.3.3.3");

    expect(jsonCalls).toHaveLength(3);
    expect(jsonCalls[0]?.init?.status).toBe(401);
    expect(jsonCalls[1]?.init?.status).toBe(401);
    expect(jsonCalls[2]?.init?.status).toBe(429);
  });

  test("evicts expired demo rate-limit entries on lookup", async () => {
    setNodeEnv("production");
    demoState.enabled = true;
    authState.validHash = false;

    await callLoginRouteWithConfig({
      body: { password: "secret" },
      headers: { "x-real-ip": "198.51.100.33" },
    });

    const g = globalThis as typeof globalThis & {
      __demoLoginRateLimit?: Map<string, LoginRateLimitEntry>;
    };
    const entry = g.__demoLoginRateLimit?.get("198.51.100.33");
    if (entry) {
      entry.resetAt = Date.now() - 1;
      g.__demoLoginRateLimit?.set("198.51.100.33", entry);
    }

    await callLoginRouteWithConfig({
      body: {},
      headers: { "x-real-ip": "198.51.100.33" },
    });

    expect(g.__demoLoginRateLimit?.has("198.51.100.33")).toBe(false);
    expect(jsonCalls[1]?.init?.status).toBe(400);
  });
});
