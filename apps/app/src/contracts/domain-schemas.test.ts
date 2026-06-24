import { describe, expect, test } from "bun:test";
import { DOMAIN_NAME_ERROR } from "@/lib/domain-validation";
import { domainNameSchema, wildcardDomainNameSchema } from "./domain-schemas";

describe("domain schemas", () => {
  test("normalizes valid domain names", () => {
    expect(domainNameSchema.parse(" VattenSvar.SE. ")).toBe("vattensvar.se");
  });

  test("rejects invalid domain names", () => {
    expect(function parseInvalidDomain() {
      domainNameSchema.parse("vattensvar");
    }).toThrow(DOMAIN_NAME_ERROR);
  });

  test("normalizes wildcard domains", () => {
    expect(wildcardDomainNameSchema.parse(" *.Apps.Example.COM. ")).toBe(
      "apps.example.com",
    );
  });
});
