import { describe, expect, test } from "bun:test";
import { getRootDomain } from "./cloudflare";

describe("getRootDomain", () => {
  test("extracts root domain from subdomain", () => {
    expect(getRootDomain("apps.example.com")).toBe("example.com");
    expect(getRootDomain("sub.apps.example.com")).toBe("example.com");
  });

  test("returns root domain as-is", () => {
    expect(getRootDomain("example.com")).toBe("example.com");
  });

  test("handles multi-level TLDs", () => {
    expect(getRootDomain("apps.example.co.uk")).toBe("example.co.uk");
    expect(getRootDomain("sub.example.com.au")).toBe("example.com.au");
    expect(getRootDomain("apps.example.org.uk")).toBe("example.org.uk");
  });

  test("throws on invalid domain", () => {
    expect(() => getRootDomain("")).toThrow("Invalid domain");
    expect(() => getRootDomain("localhost")).toThrow("Invalid domain");
    expect(() => getRootDomain("com")).toThrow("Invalid domain");
  });
});
