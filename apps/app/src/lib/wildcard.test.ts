import { describe, expect, test } from "bun:test";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function buildWildcardDomain(
  serviceName: string,
  projectName: string,
  wildcardBase: string,
  suffix?: number,
): string {
  const slug = slugify(`${serviceName}-${projectName}`);
  const base = suffix ? `${slug}-${suffix}` : slug;
  return `${base}.${wildcardBase}`;
}

describe("slugify", () => {
  test("converts to lowercase", () => {
    expect(slugify("MyService")).toBe("myservice");
  });

  test("replaces spaces with hyphens", () => {
    expect(slugify("my service")).toBe("my-service");
  });

  test("removes special characters", () => {
    expect(slugify("my@service!")).toBe("my-service");
  });

  test("collapses multiple hyphens", () => {
    expect(slugify("my---service")).toBe("my-service");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("-my-service-")).toBe("my-service");
  });

  test("handles complex names", () => {
    expect(slugify("My Service (v2) - Production")).toBe(
      "my-service-v2-production",
    );
  });

  test("handles numbers", () => {
    expect(slugify("api-v2")).toBe("api-v2");
  });
});

describe("buildWildcardDomain", () => {
  const wildcardBase = "apps.example.com";

  test("builds basic domain", () => {
    expect(buildWildcardDomain("api", "myproject", wildcardBase)).toBe(
      "api-myproject.apps.example.com",
    );
  });

  test("adds suffix for collisions", () => {
    expect(buildWildcardDomain("api", "myproject", wildcardBase, 2)).toBe(
      "api-myproject-2.apps.example.com",
    );
  });

  test("handles uppercase names", () => {
    expect(buildWildcardDomain("API", "MyProject", wildcardBase)).toBe(
      "api-myproject.apps.example.com",
    );
  });

  test("handles names with spaces", () => {
    expect(buildWildcardDomain("My Service", "My Project", wildcardBase)).toBe(
      "my-service-my-project.apps.example.com",
    );
  });

  test("handles special characters in names", () => {
    expect(buildWildcardDomain("api@v2!", "project#1", wildcardBase)).toBe(
      "api-v2-project-1.apps.example.com",
    );
  });
});
