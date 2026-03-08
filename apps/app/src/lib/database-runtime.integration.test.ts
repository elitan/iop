import { beforeAll, describe, expect, test } from "bun:test";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
  createDatabase,
  createDatabaseTarget,
  deleteDatabase,
  getDatabaseTargetConnectionInfo,
  resolveContainerName,
} from "./database-runtime";
import { db } from "./db";
import { runMigrations } from "./migrate";
import { shellEscape } from "./shell-escape";
import { getSSLDir } from "./ssl";

const execAsync = promisify(exec);

async function runTargetSql(input: {
  containerName: string;
  username: string;
  password: string;
  database: string;
  sql: string;
}): Promise<string> {
  const { stdout } = await execAsync(
    `docker exec -e PGPASSWORD=${shellEscape(input.password)} ${shellEscape(input.containerName)} ` +
      `psql "host=127.0.0.1 port=5432 user=${input.username} dbname=${input.database} sslmode=require" ` +
      `-X -t -A -c ${shellEscape(input.sql)}`,
  );

  return stdout.trim();
}

describe("database runtime integration", () => {
  beforeAll(async () => {
    runMigrations();
  });

  test("creates postgres targets with tls and stable database names", async () => {
    const projectId = randomUUID();
    const projectName = `runtime-test-${projectId.slice(0, 8)}`;
    let databaseId: string | null = null;
    let mainTargetId: string | null = null;
    let branchTargetId: string | null = null;

    await db
      .insertInto("projects")
      .values({
        id: projectId,
        name: projectName,
        hostname: null,
        createdAt: Date.now(),
      })
      .execute();

    try {
      const created = await createDatabase({
        projectId,
        name: "app-db",
        engine: "postgres",
      });
      databaseId = created.database.id;
      mainTargetId = created.target.id;

      const mainConnection = await getDatabaseTargetConnectionInfo({
        databaseId,
        targetId: mainTargetId,
      });
      const mainContainerName = await resolveContainerName({
        databaseId,
        targetId: mainTargetId,
      });

      expect(mainConnection.ssl).toBe(true);
      expect(mainConnection.hostPort).toBeGreaterThan(0);
      expect(mainConnection.database).toBe("app_db");
      expect(mainConnection.internalHost.endsWith(".frost.internal")).toBe(
        true,
      );
      expect(existsSync(getSSLDir(mainTargetId))).toBe(true);
      expect(
        await runTargetSql({
          containerName: mainContainerName,
          username: mainConnection.username,
          password: mainConnection.password,
          database: mainConnection.database,
          sql: "select current_database();",
        }),
      ).toBe("app_db");

      const branch = await createDatabaseTarget({
        databaseId,
        name: "preview",
        sourceTargetName: "main",
      });
      branchTargetId = branch.id;

      const branchConnection = await getDatabaseTargetConnectionInfo({
        databaseId,
        targetId: branchTargetId,
      });
      const branchContainerName = await resolveContainerName({
        databaseId,
        targetId: branchTargetId,
      });

      expect(branchConnection.ssl).toBe(true);
      expect(branchConnection.database).toBe("app_db");
      expect(branchConnection.database).toBe(mainConnection.database);
      expect(existsSync(getSSLDir(branchTargetId))).toBe(true);
      expect(
        await runTargetSql({
          containerName: branchContainerName,
          username: branchConnection.username,
          password: branchConnection.password,
          database: branchConnection.database,
          sql: "select current_database();",
        }),
      ).toBe("app_db");

      await deleteDatabase(databaseId);
      databaseId = null;

      expect(existsSync(getSSLDir(mainTargetId))).toBe(false);
      expect(existsSync(getSSLDir(branchTargetId))).toBe(false);
    } finally {
      if (databaseId) {
        await deleteDatabase(databaseId).catch(function ignore() {});
      }
      await db.deleteFrom("projects").where("id", "=", projectId).execute();
    }
  }, 180000);
});
