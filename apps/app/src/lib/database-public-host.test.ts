import { describe, expect, test } from "bun:test";
import { getDatabasePublicHost } from "./database-public-host";

describe("getDatabasePublicHost", () => {
  test("returns app host in local development", () => {
    expect(
      getDatabasePublicHost({
        appHost: "localhost",
        serverIp: "localhost",
      }),
    ).toBe("localhost");
  });

  test("falls back to server ip when no wildcard exists", () => {
    expect(
      getDatabasePublicHost({
        appHost: "frost.example.com",
        serverIp: "203.0.113.10",
      }),
    ).toBe("203.0.113.10");
  });

  test("falls back to app host when server ip is missing", () => {
    expect(
      getDatabasePublicHost({
        appHost: "frost.example.com",
        serverIp: null,
      }),
    ).toBe("frost.example.com");
  });
});
