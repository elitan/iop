import { afterEach, describe, expect, mock, test } from "bun:test";

type AuthState = {
  hash: string | null;
  setupComplete: boolean;
  validDev: boolean;
  validHash: boolean;
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

const cookieCalls: CookieCall[] = [];
const jsonCalls: JsonCall[] = [];
const originalNodeEnv = process.env.NODE_ENV;

function resetState() {
  authState.hash = "stored-hash";
  authState.setupComplete = true;
  authState.validDev = false;
  authState.validHash = true;
  cookieCalls.length = 0;
  jsonCalls.length = 0;
}

mock.module("next/server", function () {
  return {
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
  };
});

mock.module("@/lib/auth", function () {
  return {
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
  };
});

async function callLoginRoute() {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/auth/login", {
      body: JSON.stringify({ password: "secret" }),
      method: "POST",
    }),
  );
}

async function callLoginRouteWithBody(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/auth/login", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  );
}

afterEach(function () {
  resetState();
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("login route", function () {
  test("returns 400 when password missing", async function () {
    await callLoginRouteWithBody({});

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "password is required" });
    expect(jsonCalls[0]?.init?.status).toBe(400);
    expect(cookieCalls).toHaveLength(0);
  });

  test("returns 503 when setup not complete", async function () {
    authState.setupComplete = false;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "setup not complete" });
    expect(jsonCalls[0]?.init?.status).toBe(503);
    expect(cookieCalls).toHaveLength(0);
  });

  test("returns 401 when password invalid", async function () {
    process.env.NODE_ENV = "production";
    authState.validHash = false;
    authState.validDev = false;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ error: "invalid password" });
    expect(jsonCalls[0]?.init?.status).toBe(401);
    expect(cookieCalls).toHaveLength(0);
  });

  test("sets secure false in development", async function () {
    process.env.NODE_ENV = "development";
    authState.validHash = false;
    authState.validDev = true;

    await callLoginRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe("frost_session");
    expect(cookieCalls[0]?.options.secure).toBe(false);
  });

  test("sets secure true and expected options in production", async function () {
    process.env.NODE_ENV = "production";

    await callLoginRoute();

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
});
