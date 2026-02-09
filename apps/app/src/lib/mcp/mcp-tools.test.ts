import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { registerTools } from "./tools";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

class FakeMcpServer {
  readonly handlers = new Map<string, ToolHandler>();

  tool(name: string, ...args: unknown[]) {
    const handler = args[args.length - 1] as ToolHandler;
    this.handlers.set(name, handler);
    return {
      disable() {},
      enable() {},
      remove() {},
    };
  }
}

function parseJsonContent<T>(result: ToolResult): T {
  const text = result.content[0]?.text;
  if (!text) {
    throw new Error("Tool result has no content text");
  }
  return JSON.parse(text) as T;
}

const testSuffix = nanoid(8);
const projectId = `mcp-proj-${testSuffix}`;
const environmentId = `mcp-env-${testSuffix}`;
const settingKeys = ["domain", "email"] as const;
let originalSettings: { key: string; value: string }[] = [];
let handlers: Map<string, ToolHandler>;
let dockerBinDir = "";
let originalPath = "";

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`Tool not registered: ${name}`);
  }
  return handler(args);
}

async function insertService(overrides?: Record<string, unknown>) {
  const id = `mcp-svc-${nanoid(8)}`;
  const now = Date.now();
  const defaultName = `svc-${nanoid(6)}`;

  await db
    .insertInto("services")
    .values({
      id,
      environmentId,
      name: defaultName,
      hostname: defaultName,
      deployType: "image",
      serviceType: "app",
      imageUrl: "nginx:alpine",
      envVars: "[]",
      volumes: "[]",
      autoDeploy: false,
      createdAt: now,
      ...(overrides ?? {}),
    })
    .execute();

  return id;
}

async function insertDeployment(
  serviceId: string,
  overrides?: Record<string, unknown>,
) {
  const id = `mcp-dep-${nanoid(8)}`;
  const now = Date.now();

  await db
    .insertInto("deployments")
    .values({
      id,
      serviceId,
      environmentId,
      commitSha: `sha-${nanoid(6)}`,
      status: "running",
      createdAt: now,
      ...(overrides ?? {}),
    })
    .execute();

  return id;
}

beforeAll(async () => {
  const fakeServer = new FakeMcpServer();
  registerTools(fakeServer as unknown as McpServer);
  handlers = fakeServer.handlers;

  dockerBinDir = mkdtempSync(join(tmpdir(), "frost-mcp-tools-docker-"));
  const dockerScriptPath = join(dockerBinDir, "docker");
  writeFileSync(
    dockerScriptPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" != "logs" ]]; then
  echo "unsupported command" >&2
  exit 1
fi

container="\${!#}"
case "$container" in
  c-replica-0)
    echo "r0-line-1"
    echo "r0-line-2"
    ;;
  c-replica-1)
    echo "r1-line-1"
    ;;
  c-primary)
    echo "primary-line-1"
    ;;
  *)
    echo "unknown-container-$container"
    ;;
esac
`,
    { mode: 0o755 },
  );
  originalPath = process.env.PATH ?? "";
  process.env.PATH = `${dockerBinDir}:${originalPath}`;

  originalSettings = await db
    .selectFrom("settings")
    .select(["key", "value"])
    .where("key", "in", settingKeys as unknown as string[])
    .execute();

  await db
    .deleteFrom("settings")
    .where("key", "in", settingKeys as unknown as string[])
    .execute();

  await db
    .insertInto("settings")
    .values([
      { key: "domain", value: "admin.example.test" },
      { key: "email", value: "ops@example.test" },
    ])
    .execute();

  const now = Date.now();
  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `mcp-project-${testSuffix}`,
      hostname: `mcp-project-${testSuffix}`,
      envVars: "[]",
      createdAt: now,
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: environmentId,
      projectId,
      name: "production",
      type: "production",
      createdAt: now,
    })
    .execute();
});

afterAll(async () => {
  await db
    .deleteFrom("replicas")
    .where(
      "deploymentId",
      "in",
      db
        .selectFrom("deployments")
        .select("id")
        .where("environmentId", "=", environmentId),
    )
    .execute();

  await db
    .deleteFrom("deployments")
    .where("environmentId", "=", environmentId)
    .execute();

  await db
    .deleteFrom("domains")
    .where("environmentId", "=", environmentId)
    .execute();

  await db
    .deleteFrom("services")
    .where("environmentId", "=", environmentId)
    .execute();

  await db.deleteFrom("environments").where("id", "=", environmentId).execute();

  await db.deleteFrom("projects").where("id", "=", projectId).execute();

  await db
    .deleteFrom("settings")
    .where("key", "in", settingKeys as unknown as string[])
    .execute();

  if (originalSettings.length > 0) {
    await db.insertInto("settings").values(originalSettings).execute();
  }

  process.env.PATH = originalPath;
  rmSync(dockerBinDir, { recursive: true, force: true });
});

describe("MCP deployment and env tools", () => {
  test("list_deployments does not include buildLog", async () => {
    const serviceId = await insertService();
    await insertDeployment(serviceId, {
      status: "failed",
      buildLog: "very large build log content",
    });

    const result = await callTool("list_deployments", { serviceId, limit: 10 });
    expect(result.isError).toBeUndefined();

    const deployments =
      parseJsonContent<Array<Record<string, string | number | null>>>(result);
    expect(deployments.length).toBeGreaterThan(0);
    expect("buildLog" in deployments[0]).toBe(false);
  });

  test("delete_env_vars removes keys and returns redeployRequired", async () => {
    const serviceId = await insertService({
      envVars: JSON.stringify([
        { key: "KEEP_ME", value: "yes" },
        { key: "REMOVE_ME", value: "no" },
      ]),
    });

    const result = await callTool("delete_env_vars", {
      serviceId,
      keys: ["REMOVE_ME"],
    });
    expect(result.isError).toBeUndefined();

    const payload = parseJsonContent<{
      envVars: Array<{ key: string; value: string }>;
      redeployRequired: boolean;
    }>(result);
    expect(payload.redeployRequired).toBe(true);
    expect(payload.envVars).toEqual([{ key: "KEEP_ME", value: "yes" }]);

    const service = await db
      .selectFrom("services")
      .select("envVars")
      .where("id", "=", serviceId)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(service.envVars)).toEqual([
      { key: "KEEP_ME", value: "yes" },
    ]);
  });
});

describe("MCP runtime logs", () => {
  test("get_runtime_logs uses replicas and prefixes multi-replica output", async () => {
    const serviceId = await insertService();
    const deploymentId = await insertDeployment(serviceId, {
      status: "running",
      containerId: "c-primary",
    });

    await db
      .insertInto("replicas")
      .values([
        {
          id: `mcp-rep-${nanoid(8)}`,
          deploymentId,
          replicaIndex: 0,
          containerId: "c-replica-0",
          status: "running",
        },
        {
          id: `mcp-rep-${nanoid(8)}`,
          deploymentId,
          replicaIndex: 1,
          containerId: "c-replica-1",
          status: "running",
        },
      ])
      .execute();

    const result = await callTool("get_runtime_logs", {
      serviceId,
      tail: 50,
    });
    expect(result.isError).toBeUndefined();

    const payload = parseJsonContent<{ logs: string }>(result);
    expect(payload.logs).toContain("[replica-0] r0-line-1");
    expect(payload.logs).toContain("[replica-1] r1-line-1");
    expect(payload.logs).not.toContain("primary-line-1");
  });

  test("get_runtime_logs supports replica filter", async () => {
    const serviceId = await insertService();
    const deploymentId = await insertDeployment(serviceId, {
      status: "running",
      containerId: "c-primary",
    });

    await db
      .insertInto("replicas")
      .values([
        {
          id: `mcp-rep-${nanoid(8)}`,
          deploymentId,
          replicaIndex: 0,
          containerId: "c-replica-0",
          status: "running",
        },
        {
          id: `mcp-rep-${nanoid(8)}`,
          deploymentId,
          replicaIndex: 1,
          containerId: "c-replica-1",
          status: "running",
        },
      ])
      .execute();

    const result = await callTool("get_runtime_logs", {
      serviceId,
      replica: 1,
    });
    expect(result.isError).toBeUndefined();

    const payload = parseJsonContent<{ logs: string }>(result);
    expect(payload.logs).toContain("r1-line-1");
    expect(payload.logs).not.toContain("r0-line-1");
  });

  test("get_runtime_logs falls back to deployment containerId", async () => {
    const serviceId = await insertService();
    await insertDeployment(serviceId, {
      status: "running",
      containerId: "c-primary",
    });

    const result = await callTool("get_runtime_logs", { serviceId, tail: 20 });
    expect(result.isError).toBeUndefined();

    const payload = parseJsonContent<{ logs: string }>(result);
    expect(payload.logs).toContain("primary-line-1");
  });
});

describe("MCP domain sync behavior", () => {
  test("add_domain does not sync Caddy for unverified domains", async () => {
    const serviceId = await insertService();
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const result = await callTool("add_domain", {
        serviceId,
        domain: `add-${nanoid(6)}.example.test`,
      });
      expect(result.isError).toBeUndefined();

      const created = parseJsonContent<{
        dnsVerified: boolean | number | null;
      }>(result);
      expect(Boolean(created.dnsVerified)).toBe(false);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("remove_domain syncs Caddy for verified domains", async () => {
    const serviceId = await insertService();
    const domainId = `mcp-dom-${nanoid(8)}`;
    await db
      .insertInto("domains")
      .values({
        id: domainId,
        serviceId,
        environmentId,
        domain: `remove-${nanoid(6)}.example.test`,
        type: "proxy",
        redirectTarget: null,
        redirectCode: null,
        dnsVerified: true,
        sslStatus: "active",
        isSystem: false,
        createdAt: Date.now(),
      })
      .execute();

    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const result = await callTool("remove_domain", { domainId });
      expect(result.isError).toBeUndefined();
      expect(fetchCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("MCP service configuration completeness", () => {
  test("create_service persists replica and timeout fields with repo autoDeploy default", async () => {
    const serviceName = `repo-service-${nanoid(6)}`;
    const result = await callTool("create_service", {
      projectId,
      name: serviceName,
      deployType: "repo",
      repoUrl: "https://github.com/example/repo.git",
      branch: "main",
      dockerfilePath: "Dockerfile",
      buildContext: ".",
      shutdownTimeout: 25,
      drainTimeout: 12,
      frostFilePath: "frost.yml",
      replicaCount: 3,
    });
    expect(result.isError).toBeUndefined();

    const created = parseJsonContent<{
      id: string;
      autoDeploy: boolean | number | null;
      shutdownTimeout: number | null;
      drainTimeout: number | null;
      frostFilePath: string | null;
      replicaCount: number;
    }>(result);
    expect(Boolean(created.autoDeploy)).toBe(true);
    expect(created.shutdownTimeout).toBe(25);
    expect(created.drainTimeout).toBe(12);
    expect(created.frostFilePath).toBe("frost.yml");
    expect(created.replicaCount).toBe(3);

    const persisted = await db
      .selectFrom("services")
      .select([
        "autoDeploy",
        "shutdownTimeout",
        "drainTimeout",
        "frostFilePath",
        "replicaCount",
      ])
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();

    expect(Boolean(persisted.autoDeploy)).toBe(true);
    expect(persisted.shutdownTimeout).toBe(25);
    expect(persisted.drainTimeout).toBe(12);
    expect(persisted.frostFilePath).toBe("frost.yml");
    expect(persisted.replicaCount).toBe(3);
  });

  test("create_service validates required source fields", async () => {
    const repoResult = await callTool("create_service", {
      projectId,
      name: `repo-invalid-${nanoid(6)}`,
      deployType: "repo",
    });
    expect(repoResult.isError).toBe(true);
    expect(repoResult.content[0]?.text).toBe(
      "repoUrl is required for repo deployments",
    );

    const imageResult = await callTool("create_service", {
      projectId,
      name: `image-invalid-${nanoid(6)}`,
      deployType: "image",
    });
    expect(imageResult.isError).toBe(true);
    expect(imageResult.content[0]?.text).toBe(
      "imageUrl is required for image deployments",
    );
  });

  test("create_service rejects replicas with volumes", async () => {
    const result = await callTool("create_service", {
      projectId,
      name: `volume-replica-${nanoid(6)}`,
      deployType: "image",
      imageUrl: "nginx:alpine",
      replicaCount: 2,
      volumes: [{ name: "data", path: "/data" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Cannot use replicas with volumes");
  });

  test("update_service maps autoDeployEnabled to service autoDeploy", async () => {
    const serviceId = await insertService({
      deployType: "repo",
      repoUrl: "https://github.com/example/repo.git",
      autoDeploy: true,
    });

    const result = await callTool("update_service", {
      serviceId,
      autoDeployEnabled: false,
    });
    expect(result.isError).toBeUndefined();

    const updated = parseJsonContent<{ autoDeploy: boolean | number | null }>(
      result,
    );
    expect(Boolean(updated.autoDeploy)).toBe(false);

    const fromDb = await db
      .selectFrom("services")
      .select("autoDeploy")
      .where("id", "=", serviceId)
      .executeTakeFirstOrThrow();
    expect(Boolean(fromDb.autoDeploy)).toBe(false);
  });
});
