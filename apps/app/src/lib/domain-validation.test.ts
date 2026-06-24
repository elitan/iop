import { describe, expect, test } from "bun:test";
import {
  DOMAIN_NAME_ERROR,
  getDomainNameValidationError,
  isValidDomainName,
  normalizeDomainName,
  parseDomainName,
} from "./domain-validation";

describe("domain validation", () => {
  test("normalizes user-entered domains", () => {
    expect(normalizeDomainName(" VattenSvar.SE. ")).toBe("vattensvar.se");
  });

  test("accepts valid public domain names", () => {
    expect(isValidDomainName("vattensvar.se")).toBe(true);
    expect(isValidDomainName("www.vattensvar.se")).toBe(true);
    expect(isValidDomainName("my-app.example.com")).toBe(true);
  });

  test("rejects non-domain hostnames and malformed hostnames", () => {
    expect(isValidDomainName("vattensvar")).toBe(false);
    expect(isValidDomainName("localhost")).toBe(false);
    expect(isValidDomainName("com")).toBe(false);
    expect(isValidDomainName("http://vattensvar.se")).toBe(false);
    expect(isValidDomainName("vattensvar.se/path")).toBe(false);
    expect(isValidDomainName("vattensvar.se:443")).toBe(false);
    expect(isValidDomainName("*.vattensvar.se")).toBe(false);
    expect(isValidDomainName("foo_bar.example.com")).toBe(false);
    expect(isValidDomainName("-foo.example.com")).toBe(false);
    expect(isValidDomainName("foo-.example.com")).toBe(false);
  });

  test("returns user-facing validation message for invalid values", () => {
    expect(getDomainNameValidationError("vattensvar")).toBe(DOMAIN_NAME_ERROR);
    expect(getDomainNameValidationError("")).toBeNull();
  });

  test("parses valid domains to their normalized form", () => {
    expect(parseDomainName(" VattenSvar.SE. ")).toBe("vattensvar.se");
    expect(function parseInvalidDomain() {
      parseDomainName("vattensvar");
    }).toThrow(DOMAIN_NAME_ERROR);
  });
});
