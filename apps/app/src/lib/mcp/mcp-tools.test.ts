import { beforeAll, describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

let handlers: Map<string, ToolHandler>;

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

beforeAll(function setupServer() {
  const fakeServer = new FakeMcpServer();
  registerTools(fakeServer as unknown as McpServer);
  handlers = fakeServer.handlers;
});

describe("MCP tools", () => {
  test("registers only search and request", function checkToolNames() {
    expect(Array.from(handlers.keys()).sort()).toEqual(["request", "search"]);
  });

  test("search returns matching operations with input details", async function () {
    const result = await callTool("search", {
      query: "project deploy",
      limit: 5,
    });

    expect(result.isError).toBeUndefined();

    const matches =
      parseJsonContent<
        Array<{
          operationId: string | null;
          method: string;
          path: string;
          pathParams: Array<{ name: string }>;
        }>
      >(result);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.operationId).toBe("projects.deploy");
    expect(matches[0]?.method).toBe("POST");
    expect(matches[0]?.path).toContain("/projects/");
    expect(matches[0]?.path).toContain("/deploy");
    expect(matches[0]?.pathParams[0]?.name).toBeTruthy();
  });

  test("search includes body schema for create operations", async function () {
    const result = await callTool("search", {
      query: "create project",
      limit: 10,
    });

    expect(result.isError).toBeUndefined();

    const matches =
      parseJsonContent<
        Array<{
          operationId: string | null;
          body: {
            required: boolean;
            contentTypes: string[];
            schema: {
              type: string;
              required: string[];
              properties: Record<string, unknown>;
            };
          } | null;
        }>
      >(result);

    const createProject = matches.find(function findMatch(match) {
      return match.operationId === "projects.create";
    });

    expect(createProject).toBeDefined();
    expect(createProject?.body?.required).toBe(true);
    expect(createProject?.body?.contentTypes).toContain("application/json");
    expect(createProject?.body?.schema).toMatchObject({
      type: "object",
      required: ["name"],
    });
  });

  test("request calls a real API operation by operationId", async function () {
    const result = await callTool("request", {
      operationId: "health.check",
    });

    expect(result.isError).toBeUndefined();

    const payload = parseJsonContent<{
      status: number;
      data: { ok: boolean; version: string };
    }>(result);

    expect(payload.status).toBe(200);
    expect(payload.data.ok).toBe(true);
    expect(payload.data.version).toBeTruthy();
  });

  test("request validates missing path params before dispatch", async function () {
    const result = await callTool("request", {
      operationId: "projects.get",
    });

    expect(result.isError).toBe(true);

    const payload = parseJsonContent<{
      error: string;
      missing: string[];
    }>(result);

    expect(payload.error).toBe("Missing path parameters");
    expect(payload.missing).toEqual(["projectId"]);
  });

  test("request surfaces API validation errors", async function () {
    const result = await callTool("request", {
      operationId: "projects.create",
      body: {},
    });

    expect(result.isError).toBe(true);

    const payload = parseJsonContent<{
      error: string;
      status: number;
      data: unknown;
    }>(result);

    expect(payload.error).toBe("API request failed");
    expect(payload.status).toBeGreaterThanOrEqual(400);
    expect(payload.data).toBeTruthy();
  });
});
