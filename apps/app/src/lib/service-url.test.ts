import { describe, expect, test } from "bun:test";
import type { Domain } from "./api";
import { getPreferredDomain, getServiceUrl } from "./service-url";

function makeDomain(overrides: Partial<Domain> & { domain: string }): Domain {
  return {
    id: "d1",
    serviceId: "s1",
    type: "proxy",
    redirectTarget: null,
    redirectCode: null,
    dnsVerified: 1,
    sslStatus: "active",
    isSystem: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("getPreferredDomain", () => {
  test("returns null for empty array", () => {
    expect(getPreferredDomain([])).toBeNull();
  });

  test("returns null when no verified domains", () => {
    const domains = [
      makeDomain({ domain: "custom.com", isSystem: 0, dnsVerified: 0 }),
      makeDomain({ domain: "app.frost.io", isSystem: 1, dnsVerified: 0 }),
    ];
    expect(getPreferredDomain(domains)).toBeNull();
  });

  test("prefers custom domain over wildcard", () => {
    const domains = [
      makeDomain({ domain: "app.frost.io", isSystem: 1, dnsVerified: 1 }),
      makeDomain({ domain: "custom.com", isSystem: 0, dnsVerified: 1 }),
    ];
    expect(getPreferredDomain(domains)?.domain).toBe("custom.com");
  });

  test("falls back to wildcard when no custom domain", () => {
    const domains = [
      makeDomain({ domain: "app.frost.io", isSystem: 1, dnsVerified: 1 }),
    ];
    expect(getPreferredDomain(domains)?.domain).toBe("app.frost.io");
  });

  test("ignores unverified custom domain, returns verified wildcard", () => {
    const domains = [
      makeDomain({ domain: "custom.com", isSystem: 0, dnsVerified: 0 }),
      makeDomain({ domain: "app.frost.io", isSystem: 1, dnsVerified: 1 }),
    ];
    expect(getPreferredDomain(domains)?.domain).toBe("app.frost.io");
  });

  test("returns first verified custom domain when multiple exist", () => {
    const domains = [
      makeDomain({ domain: "first.com", isSystem: 0, dnsVerified: 1 }),
      makeDomain({ domain: "second.com", isSystem: 0, dnsVerified: 1 }),
    ];
    expect(getPreferredDomain(domains)?.domain).toBe("first.com");
  });
});

describe("getServiceUrl", () => {
  test("returns domain when available", () => {
    const domains = [
      makeDomain({ domain: "custom.com", isSystem: 0, dnsVerified: 1 }),
    ];
    expect(getServiceUrl(domains, "1.2.3.4", 3000)).toBe("custom.com");
  });

  test("returns IP:port when no verified domain", () => {
    expect(getServiceUrl([], "1.2.3.4", 3000)).toBe("1.2.3.4:3000");
  });

  test("returns null when no domain and no IP", () => {
    expect(getServiceUrl([], null, 3000)).toBeNull();
  });

  test("returns null when no domain and no port", () => {
    expect(getServiceUrl([], "1.2.3.4", null)).toBeNull();
  });
});
