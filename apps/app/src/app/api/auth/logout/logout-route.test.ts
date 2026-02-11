import { afterEach, describe, expect, mock, test } from "bun:test";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
  value: string;
};

type JsonCall = {
  body: unknown;
  init: { status?: number } | undefined;
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
  cookieCalls.length = 0;
  jsonCalls.length = 0;
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

async function callLogoutRoute() {
  const { POST } = await import("./route");
  return POST();
}

afterEach(() => {
  resetState();
  setNodeEnv(originalNodeEnv);
});

describe("logout route", () => {
  test("clears session cookie with expected options in production", async () => {
    setNodeEnv("production");

    await callLogoutRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]).toEqual({
      name: "frost_session",
      options: {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "strict",
        secure: true,
      },
      value: "",
    });
  });

  test("sets secure false outside production", async () => {
    setNodeEnv("development");

    await callLogoutRoute();

    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.options.secure).toBe(false);
  });
});
