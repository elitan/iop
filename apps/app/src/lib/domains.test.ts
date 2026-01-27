import { describe, expect, test } from "bun:test";
import { extractSubdomain } from "./domain-utils";
import { buildWildcardSlug } from "./domains";

describe("extractSubdomain", () => {
  test("extracts subdomain from full domain", () => {
    expect(extractSubdomain("testapp.frost.j4labs.se")).toBe("testapp");
  });

  test("returns @ for apex domain (two parts)", () => {
    expect(extractSubdomain("example.com")).toBe("@");
  });

  test("returns @ for single part domain", () => {
    expect(extractSubdomain("localhost")).toBe("@");
  });

  test("handles www subdomain", () => {
    expect(extractSubdomain("www.example.com")).toBe("www");
  });

  test("handles deep subdomain (only returns first part)", () => {
    expect(extractSubdomain("api.v2.example.com")).toBe("api");
  });

  test("handles subdomain with hyphens", () => {
    expect(extractSubdomain("my-app.example.com")).toBe("my-app");
  });
});

describe("buildWildcardSlug", () => {
  test("builds slug without env name", () => {
    expect(buildWildcardSlug("api", "myproject")).toBe("api-myproject");
  });

  test("builds slug with env name", () => {
    expect(buildWildcardSlug("api", "myproject", "staging")).toBe(
      "api-staging-myproject",
    );
  });

  test("truncates long env name to fit 63 char limit", () => {
    const slug = buildWildcardSlug(
      "frost",
      "frost-marketing",
      "feat-add-frost-internal-something-long-name-that-exceeds",
    );
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug).toStartWith("frost-");
    expect(slug).toEndWith("-frost-marketing");
  });

  test("removes trailing dashes after truncation", () => {
    const envName = `${"a".repeat(50)}-----`;
    const slug = buildWildcardSlug("api", "proj", envName);
    expect(slug).toBe(`api-${"a".repeat(50)}-proj`);
  });

  test("handles edge case with very long service+project names", () => {
    const slug = buildWildcardSlug(
      "very-long-service-name-here",
      "another-long-project-name",
      "env",
    );
    expect(slug.length).toBeLessThanOrEqual(63);
  });

  test("handles case where service+project alone exceed 63 chars", () => {
    const slug = buildWildcardSlug(
      "this-is-a-very-long-service-name",
      "and-this-is-a-very-long-project-name",
    );
    expect(slug.length).toBe(63);
  });

  test("exact 63 char boundary", () => {
    const slug = buildWildcardSlug("api", "proj", "a".repeat(56));
    expect(slug.length).toBe(63);
  });
});
