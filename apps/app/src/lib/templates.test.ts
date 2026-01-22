import { beforeEach, describe, expect, it } from "bun:test";
import {
  buildConnectionString,
  clearTemplateCache,
  generateCredential,
  getDatabaseTemplates,
  getProjectTemplates,
  getServiceTemplates,
  getTemplate,
  getTemplates,
  resolveTemplateServices,
} from "./templates";

beforeEach(() => {
  clearTemplateCache();
});

describe("getTemplates", () => {
  it("loads all templates from yaml files", () => {
    const templates = getTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it("includes database templates", () => {
    const templates = getTemplates();
    const postgres = templates.find((t) => t.id === "postgres");
    expect(postgres).toBeDefined();
    expect(postgres?.type).toBe("database");
  });

  it("includes service templates", () => {
    const templates = getTemplates();
    const nginx = templates.find((t) => t.id === "nginx");
    expect(nginx).toBeDefined();
    expect(nginx?.type).toBe("service");
  });

  it("includes project templates", () => {
    const templates = getTemplates();
    const plausible = templates.find((t) => t.id === "plausible");
    expect(plausible).toBeDefined();
    expect(plausible?.type).toBe("project");
  });
});

describe("getTemplate", () => {
  it("returns a template by id", () => {
    const template = getTemplate("postgres");
    expect(template).toBeDefined();
    expect(template?.name).toBe("PostgreSQL 17");
  });

  it("returns undefined for unknown template", () => {
    const template = getTemplate("nonexistent");
    expect(template).toBeUndefined();
  });
});

describe("getServiceTemplates", () => {
  it("returns only service templates (not databases)", () => {
    const templates = getServiceTemplates();
    for (const t of templates) {
      expect(t.type).toBe("service");
    }
  });
});

describe("getProjectTemplates", () => {
  it("returns only project templates", () => {
    const templates = getProjectTemplates();
    for (const t of templates) {
      expect(t.type).toBe("project");
    }
  });
});

describe("getDatabaseTemplates", () => {
  it("returns only database templates", () => {
    const templates = getDatabaseTemplates();
    for (const t of templates) {
      expect(t.type).toBe("database");
    }
  });
});

describe("generateCredential", () => {
  it("generates a password of 32 characters", () => {
    const cred = generateCredential("password");
    expect(cred.length).toBe(32);
  });

  it("generates a base64_32 secret", () => {
    const cred = generateCredential("base64_32");
    const decoded = Buffer.from(cred, "base64");
    expect(decoded.length).toBe(32);
  });

  it("generates a base64_64 secret", () => {
    const cred = generateCredential("base64_64");
    const decoded = Buffer.from(cred, "base64");
    expect(decoded.length).toBe(64);
  });
});

describe("resolveTemplateServices", () => {
  it("resolves a single-service template", () => {
    const template = getTemplate("postgres");
    expect(template).toBeDefined();
    const resolved = resolveTemplateServices(template!);
    expect(resolved.length).toBe(1);

    const svc = resolved[0];
    expect(svc.name).toBe("postgres");
    expect(svc.image).toBe("postgres:17-alpine");
    expect(svc.port).toBe(5432);
    expect(svc.isDatabase).toBe(true);
  });

  it("generates credentials for env vars", () => {
    const template = getTemplate("postgres");
    expect(template).toBeDefined();
    const resolved = resolveTemplateServices(template!);
    const svc = resolved[0];

    const passwordEnv = svc.envVars.find((e) => e.key === "POSTGRES_PASSWORD");
    expect(passwordEnv).toBeDefined();
    expect(passwordEnv?.value.length).toBe(32);
    expect(passwordEnv?.generated).toBe(true);
  });

  it("resolves cross-service references in project templates", () => {
    const template = getTemplate("plausible");
    expect(template).toBeDefined();
    const resolved = resolveTemplateServices(template!);
    expect(resolved.length).toBe(3);

    const plausibleSvc = resolved.find((s) => s.name === "plausible");
    expect(plausibleSvc).toBeDefined();

    const dbUrlEnv = plausibleSvc?.envVars.find(
      (e) => e.key === "DATABASE_URL",
    );
    expect(dbUrlEnv).toBeDefined();
    expect(dbUrlEnv?.value).not.toContain("${");
    expect(dbUrlEnv?.value).toContain("postgres://postgres:");
  });

  it("sets main service correctly in project templates", () => {
    const template = getTemplate("plausible");
    expect(template).toBeDefined();
    const resolved = resolveTemplateServices(template!);

    const mainServices = resolved.filter((s) => s.isMain);
    expect(mainServices.length).toBe(1);
    expect(mainServices[0].name).toBe("plausible");
  });

  it("parses volumes correctly", () => {
    const template = getTemplate("postgres");
    expect(template).toBeDefined();
    const resolved = resolveTemplateServices(template!);
    const svc = resolved[0];

    expect(svc.volumes.length).toBe(1);
    expect(svc.volumes[0].name).toBe("data");
    expect(svc.volumes[0].path).toBe("/var/lib/postgresql/data");
  });
});

describe("buildConnectionString", () => {
  it("builds postgres connection string", () => {
    const connStr = buildConnectionString(
      "postgres:17-alpine",
      "localhost",
      5432,
      {
        POSTGRES_USER: "user",
        POSTGRES_PASSWORD: "pass",
        POSTGRES_DB: "mydb",
      },
    );
    expect(connStr).toBe(
      "postgresql://user:pass@localhost:5432/mydb?sslmode=require",
    );
  });

  it("builds mysql connection string", () => {
    const connStr = buildConnectionString("mysql:8", "localhost", 3306, {
      MYSQL_ROOT_PASSWORD: "rootpass",
      MYSQL_DATABASE: "mydb",
    });
    expect(connStr).toBe("mysql://root:rootpass@localhost:3306/mydb");
  });

  it("builds redis connection string", () => {
    const connStr = buildConnectionString(
      "redis:7-alpine",
      "localhost",
      6379,
      {},
    );
    expect(connStr).toBe("redis://localhost:6379");
  });

  it("builds mongo connection string", () => {
    const connStr = buildConnectionString("mongo:7", "localhost", 27017, {
      MONGO_INITDB_ROOT_USERNAME: "root",
      MONGO_INITDB_ROOT_PASSWORD: "pass",
    });
    expect(connStr).toBe("mongodb://root:pass@localhost:27017");
  });

  it("returns empty string for unknown database", () => {
    const connStr = buildConnectionString(
      "unknown:latest",
      "localhost",
      1234,
      {},
    );
    expect(connStr).toBe("");
  });
});
