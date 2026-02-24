import { describe, expect, test } from "bun:test";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoAlt,
  getDatabaseLogoUrl,
} from "./database-logo";

describe("getDatabaseLogoUrl", () => {
  test("returns postgres logo url", () => {
    expect(getDatabaseLogoUrl("postgres")).toBe(
      "https://cdn.simpleicons.org/postgresql",
    );
  });

  test("returns mysql logo url", () => {
    expect(getDatabaseLogoUrl("mysql")).toBe(
      "https://cdn.simpleicons.org/mysql",
    );
  });
});

describe("getDatabaseLogoAlt", () => {
  test("returns postgres alt text", () => {
    expect(getDatabaseLogoAlt("postgres")).toBe("PostgreSQL logo");
  });

  test("returns mysql alt text", () => {
    expect(getDatabaseLogoAlt("mysql")).toBe("MySQL logo");
  });
});

describe("DATABASE_LOGO_FALLBACK", () => {
  test("uses docker fallback icon", () => {
    expect(DATABASE_LOGO_FALLBACK).toBe(
      "https://cdn.simpleicons.org/docker/666666",
    );
  });
});
