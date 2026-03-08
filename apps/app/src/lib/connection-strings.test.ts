import { describe, expect, it } from "bun:test";
import { buildPostgresConnectionString } from "./connection-strings";

describe("buildPostgresConnectionString", () => {
  it("adds sslmode require when ssl is enabled", () => {
    const value = buildPostgresConnectionString({
      username: "user",
      password: "pass",
      host: "127.0.0.1",
      port: 5432,
      database: "app_db",
      ssl: true,
    });

    expect(value).toBe(
      "postgres://user:pass@127.0.0.1:5432/app_db?sslmode=require",
    );
  });

  it("omits sslmode when ssl is disabled", () => {
    const value = buildPostgresConnectionString({
      username: "user",
      password: "pass",
      host: "127.0.0.1",
      port: 5432,
      database: "app_db",
      ssl: false,
    });

    expect(value).toBe("postgres://user:pass@127.0.0.1:5432/app_db");
  });
});
