import { describe, expect, test } from "bun:test";
import { db } from "./db";
import { extractSubdomain } from "./domain-utils";
import { backfillWildcardDomains, buildWildcardSlug } from "./domains";
import { runMigrations } from "./migrate";

runMigrations();

function setNodeEnvForTest(value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }

  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

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

describe("backfillWildcardDomains", () => {
  test("creates system domains for app and object storage services", async function testObjectStorageBackfill() {
    const previousNodeEnv = process.env.NODE_ENV;
    const suffix = `domains-${Date.now()}`;
    const projectId = `proj-${suffix}`;
    const environmentId = `env-${suffix}`;
    const appServiceId = `svc-app-${suffix}`;
    const objectStorageServiceId = `svc-object-storage-${suffix}`;
    const databaseServiceId = `svc-database-${suffix}`;
    const settingKeys = ["wildcard_domain", "email", "domain"];
    const previousSettings = await db
      .selectFrom("settings")
      .selectAll()
      .where("key", "in", settingKeys)
      .execute();
    const previousFakeWildcardDomains = await db
      .selectFrom("domains")
      .select("id")
      .where("domain", "like", "%.apps.example.com")
      .execute();
    const previousFakeWildcardDomainIds = new Set(
      previousFakeWildcardDomains.map(function getDomainId(domain) {
        return domain.id;
      }),
    );

    setNodeEnvForTest("production");

    try {
      await db
        .insertInto("settings")
        .values({ key: "wildcard_domain", value: "apps.example.com" })
        .onConflict((oc) =>
          oc.column("key").doUpdateSet({ value: "apps.example.com" }),
        )
        .execute();
      await db
        .deleteFrom("settings")
        .where("key", "in", ["email", "domain"])
        .execute();
      await db
        .insertInto("projects")
        .values({
          id: projectId,
          name: "Project",
          hostname: "project",
          envVars: "[]",
          createdAt: Date.now(),
        })
        .execute();
      await db
        .insertInto("environments")
        .values({
          id: environmentId,
          projectId,
          name: "production",
          type: "production",
          isEphemeral: false,
          createdAt: Date.now(),
        })
        .execute();
      await db
        .insertInto("services")
        .values([
          {
            id: appServiceId,
            environmentId,
            name: "web",
            hostname: "web",
            deployType: "image",
            serviceType: "app",
            imageUrl: "nginx:alpine",
            envVars: "[]",
            createdAt: Date.now(),
          },
          {
            id: objectStorageServiceId,
            environmentId,
            name: "object-storage",
            hostname: "s3-files",
            deployType: "image",
            serviceType: "object-storage",
            imageUrl: "garage:latest",
            envVars: "[]",
            createdAt: Date.now(),
          },
          {
            id: databaseServiceId,
            environmentId,
            name: "postgres",
            hostname: "postgres",
            deployType: "image",
            serviceType: "database",
            imageUrl: "postgres:16",
            envVars: "[]",
            createdAt: Date.now(),
          },
        ])
        .execute();

      const count = await backfillWildcardDomains();
      const domains = await db
        .selectFrom("domains")
        .select(["serviceId", "domain", "isSystem"])
        .where("serviceId", "in", [
          appServiceId,
          objectStorageServiceId,
          databaseServiceId,
        ])
        .orderBy("domain", "asc")
        .execute();

      expect(count).toBeGreaterThanOrEqual(2);
      expect(
        domains.map(function normalizeDomain(domain) {
          return { ...domain, isSystem: Boolean(domain.isSystem) };
        }),
      ).toEqual([
        {
          serviceId: objectStorageServiceId,
          domain: "s3-files-project.apps.example.com",
          isSystem: true,
        },
        {
          serviceId: appServiceId,
          domain: "web-project.apps.example.com",
          isSystem: true,
        },
      ]);
    } finally {
      await db
        .deleteFrom("domains")
        .where("serviceId", "in", [
          appServiceId,
          objectStorageServiceId,
          databaseServiceId,
        ])
        .execute();
      const fakeWildcardDomains = await db
        .selectFrom("domains")
        .select("id")
        .where("domain", "like", "%.apps.example.com")
        .execute();
      const createdFakeWildcardDomainIds = fakeWildcardDomains
        .map(function getDomainId(domain) {
          return domain.id;
        })
        .filter(function isCreatedByTest(id) {
          return !previousFakeWildcardDomainIds.has(id);
        });
      if (createdFakeWildcardDomainIds.length > 0) {
        await db
          .deleteFrom("domains")
          .where("id", "in", createdFakeWildcardDomainIds)
          .execute();
      }
      await db
        .deleteFrom("services")
        .where("environmentId", "=", environmentId)
        .execute();
      await db
        .deleteFrom("environments")
        .where("id", "=", environmentId)
        .execute();
      await db.deleteFrom("projects").where("id", "=", projectId).execute();
      await db.deleteFrom("settings").where("key", "in", settingKeys).execute();
      if (previousSettings.length > 0) {
        await db.insertInto("settings").values(previousSettings).execute();
      }
      setNodeEnvForTest(previousNodeEnv);
    }
  });
});
