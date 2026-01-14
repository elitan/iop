import { describe, expect, test } from "bun:test";
import { slugify } from "./slugify";

describe("slugify", () => {
  test("converts to lowercase", () => {
    expect(slugify("MyService")).toBe("myservice");
    expect(slugify("UPPERCASE")).toBe("uppercase");
  });

  test("replaces spaces with hyphens", () => {
    expect(slugify("my service")).toBe("my-service");
    expect(slugify("my  service")).toBe("my-service");
  });

  test("replaces special characters with hyphens", () => {
    expect(slugify("my_service")).toBe("my-service");
    expect(slugify("my.service")).toBe("my-service");
    expect(slugify("my@service!")).toBe("my-service");
  });

  test("removes leading and trailing hyphens", () => {
    expect(slugify("-myservice-")).toBe("myservice");
    expect(slugify("--myservice--")).toBe("myservice");
    expect(slugify("  myservice  ")).toBe("myservice");
  });

  test("collapses multiple hyphens", () => {
    expect(slugify("my---service")).toBe("my-service");
    expect(slugify("my - - service")).toBe("my-service");
  });

  test("handles real-world examples", () => {
    expect(slugify("My Cool App")).toBe("my-cool-app");
    expect(slugify("PostgreSQL Database")).toBe("postgresql-database");
    expect(slugify("api-gateway")).toBe("api-gateway");
    expect(slugify("User Service (v2)")).toBe("user-service-v2");
  });

  test("is idempotent", () => {
    const original = "My Cool App";
    const slugified = slugify(original);
    expect(slugify(slugified)).toBe(slugified);
  });

  test("handles numbers", () => {
    expect(slugify("service123")).toBe("service123");
    expect(slugify("123service")).toBe("123service");
    expect(slugify("service 123")).toBe("service-123");
  });

  test("handles empty and edge cases", () => {
    expect(slugify("")).toBe("");
    expect(slugify("---")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  test("handles non-English characters (replaces with hyphens)", () => {
    expect(slugify("café")).toBe("caf");
    expect(slugify("naïve")).toBe("na-ve");
    expect(slugify("résumé")).toBe("r-sum");
    expect(slugify("über")).toBe("ber");
    expect(slugify("日本語")).toBe("");
    expect(slugify("서비스")).toBe("");
    expect(slugify("сервис")).toBe("");
  });

  test("handles mixed English and non-English", () => {
    expect(slugify("my café app")).toBe("my-caf-app");
    expect(slugify("über-service")).toBe("ber-service");
    expect(slugify("app-日本")).toBe("app");
  });
});
