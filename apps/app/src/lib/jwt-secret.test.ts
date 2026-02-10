import { afterEach, describe, expect, test } from "bun:test";
import { getRequiredJwtSecret } from "./jwt-secret";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalJwtSecret = env.FROST_JWT_SECRET;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete env.NODE_ENV;
    return;
  }
  env.NODE_ENV = value;
}

function setJwtSecret(value: string | undefined) {
  if (value === undefined) {
    delete env.FROST_JWT_SECRET;
    return;
  }
  env.FROST_JWT_SECRET = value;
}

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  setJwtSecret(originalJwtSecret);
});

describe("getRequiredJwtSecret", () => {
  test("returns default secret in development when missing", () => {
    setNodeEnv("development");
    setJwtSecret(undefined);

    expect(getRequiredJwtSecret()).toBe("frost-default-secret-change-me");
  });

  test("returns test secret in test when missing", () => {
    setNodeEnv("test");
    setJwtSecret(undefined);

    expect(getRequiredJwtSecret()).toBe("frost-test-secret");
  });

  test("throws in production when missing", () => {
    setNodeEnv("production");
    setJwtSecret(undefined);

    expect(() => {
      getRequiredJwtSecret();
    }).toThrow(
      "FROST_JWT_SECRET must be set and must not use the default value",
    );
  });

  test("throws in production when default secret is set", () => {
    setNodeEnv("production");
    setJwtSecret("frost-default-secret-change-me");

    expect(() => {
      getRequiredJwtSecret();
    }).toThrow(
      "FROST_JWT_SECRET must be set and must not use the default value",
    );
  });

  test("returns secret in production when set", () => {
    setNodeEnv("production");
    setJwtSecret("production-secret");

    expect(getRequiredJwtSecret()).toBe("production-secret");
  });
});
