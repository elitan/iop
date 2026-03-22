import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  OpenApiMethod,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiSchema,
  OpenApiSpec,
} from "@/lib/openapi";
import { getOpenApiSpec, handleOpenApiRequest } from "@/lib/openapi";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type SearchResult = {
  operationId: string | null;
  title: string;
  method: string;
  path: string;
  tags: string[];
  description: string | null;
  pathParams: Array<{
    name: string;
    required: boolean;
    schema: Record<string, unknown> | null;
  }>;
  queryParams: Array<{
    name: string;
    required: boolean;
    schema: Record<string, unknown> | null;
  }>;
  body: {
    required: boolean;
    contentTypes: string[];
    schema: unknown;
  } | null;
};

type OperationMatch = {
  method: OpenApiMethod;
  path: string;
  operation: OpenApiOperation;
};

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const queryValueSchema = z.union([
  scalarSchema,
  z.null(),
  z.array(z.union([scalarSchema, z.null()])),
]);

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(
  message: string,
  details?: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...(details ?? {}) }, null, 2),
      },
    ],
    isError: true,
  };
}

function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path === "/api") {
    return "/";
  }

  if (path.startsWith("/api/")) {
    return path.slice(4);
  }

  return path;
}

function getRefValue(spec: OpenApiSpec, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return null;
  }

  let current: unknown = spec;
  const parts = ref.slice(2).split("/");

  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return null;
    }

    current = (current as Record<string, unknown>)[decodeURIComponent(part)];
  }

  return current;
}

function resolveSchema(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  seen: Set<string> = new Set(),
): OpenApiSchema | null {
  if (!schema) {
    return null;
  }

  if (schema.$ref) {
    if (seen.has(schema.$ref)) {
      return null;
    }

    seen.add(schema.$ref);
    const resolved = getRefValue(spec, schema.$ref);
    if (!resolved || typeof resolved !== "object") {
      return null;
    }

    return resolveSchema(resolved as OpenApiSchema, spec, seen);
  }

  return schema;
}

function resolveParameter(
  parameter: OpenApiParameter,
  spec: OpenApiSpec,
  seen: Set<string> = new Set(),
): OpenApiParameter | null {
  if (parameter.$ref) {
    if (seen.has(parameter.$ref)) {
      return null;
    }

    seen.add(parameter.$ref);
    const resolved = getRefValue(spec, parameter.$ref);
    if (!resolved || typeof resolved !== "object") {
      return null;
    }

    return resolveParameter(resolved as OpenApiParameter, spec, seen);
  }

  return parameter;
}

function mergeObjectSchemas(
  schemas: OpenApiSchema[],
  spec: OpenApiSpec,
): OpenApiSchema {
  const merged: OpenApiSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  for (const schema of schemas) {
    const resolved = resolveSchema(schema, spec);
    if (!resolved) {
      continue;
    }

    const nested =
      resolved.allOf && resolved.allOf.length > 0
        ? mergeObjectSchemas(resolved.allOf, spec)
        : resolved;

    if (nested.properties) {
      merged.properties = {
        ...(merged.properties ?? {}),
        ...nested.properties,
      };
    }

    if (nested.required) {
      merged.required = Array.from(
        new Set([...(merged.required ?? []), ...nested.required]),
      );
    }
  }

  return merged;
}

function getSchemaType(schema: OpenApiSchema): string | null {
  if (typeof schema.type === "string") {
    return schema.type;
  }

  if (Array.isArray(schema.type) && schema.type.length > 0) {
    return schema.type.join(" | ");
  }

  if (schema.properties) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  return null;
}

function summarizeLeafSchema(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
): Record<string, unknown> | null {
  const resolved = resolveSchema(schema, spec);
  if (!resolved) {
    return null;
  }

  const result: Record<string, unknown> = {};
  const type = getSchemaType(resolved);

  if (type) {
    result.type = type;
  }

  if (resolved.format) {
    result.format = resolved.format;
  }

  if (resolved.enum && resolved.enum.length > 0) {
    result.enum = resolved.enum.slice(0, 10);
  }

  return Object.keys(result).length > 0 ? result : null;
}

function summarizeSchema(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  depth = 0,
): unknown {
  const resolved = resolveSchema(schema, spec);
  if (!resolved) {
    return null;
  }

  if (resolved.allOf && resolved.allOf.length > 0) {
    return summarizeSchema(
      mergeObjectSchemas(resolved.allOf, spec),
      spec,
      depth,
    );
  }

  if (resolved.oneOf && resolved.oneOf.length > 0) {
    return {
      oneOf: resolved.oneOf.slice(0, 5).map(function mapOneOf(item) {
        return summarizeSchema(item, spec, depth + 1);
      }),
    };
  }

  if (resolved.anyOf && resolved.anyOf.length > 0) {
    return {
      anyOf: resolved.anyOf.slice(0, 5).map(function mapAnyOf(item) {
        return summarizeSchema(item, spec, depth + 1);
      }),
    };
  }

  const type = getSchemaType(resolved);

  if (type === "array" || resolved.items) {
    return {
      type: "array",
      items: summarizeSchema(resolved.items, spec, depth + 1),
    };
  }

  if (type === "object" || resolved.properties) {
    const properties = resolved.properties ?? {};
    const propertyEntries = Object.entries(properties);

    if (depth >= 2) {
      const compact: Record<string, unknown> = {
        type: "object",
      };

      if ((resolved.required ?? []).length > 0) {
        compact.required = resolved.required;
      }

      if (propertyEntries.length > 0) {
        compact.properties = propertyEntries
          .slice(0, 10)
          .map(function mapProperty([name]) {
            return name;
          });
      }

      if (propertyEntries.length > 10) {
        compact.truncated = true;
      }

      return compact;
    }

    const summarized = Object.fromEntries(
      propertyEntries.slice(0, 10).map(function mapProperty([
        name,
        propertySchema,
      ]) {
        return [name, summarizeSchema(propertySchema, spec, depth + 1)];
      }),
    );

    return {
      type: "object",
      required: resolved.required ?? [],
      properties: summarized,
      ...(propertyEntries.length > 10 ? { truncated: true } : {}),
    };
  }

  return summarizeLeafSchema(resolved, spec) ?? "unknown";
}

function getRequestBodySchema(
  requestBody: OpenApiRequestBody | undefined,
): OpenApiSchema | undefined {
  if (!requestBody?.content) {
    return undefined;
  }

  if (requestBody.content["application/json"]?.schema) {
    return requestBody.content["application/json"].schema;
  }

  for (const content of Object.values(requestBody.content)) {
    if (content.schema) {
      return content.schema;
    }
  }

  return undefined;
}

function getBodyContentTypes(
  requestBody: OpenApiRequestBody | undefined,
): string[] {
  return Object.keys(requestBody?.content ?? {});
}

function buildSearchResult(
  method: OpenApiMethod,
  path: string,
  operation: OpenApiOperation,
  spec: OpenApiSpec,
): SearchResult {
  const parameters = (operation.parameters ?? [])
    .map(function mapParameter(parameter) {
      return resolveParameter(parameter, spec);
    })
    .filter(function isResolved(parameter): parameter is NonNullable<
      typeof parameter
    > {
      return parameter !== null;
    });

  const pathParams = parameters
    .filter(function isPathParameter(parameter) {
      return parameter.in === "path" && Boolean(parameter.name);
    })
    .map(function mapPathParameter(parameter) {
      return {
        name: parameter.name ?? "",
        required: Boolean(parameter.required),
        schema: summarizeLeafSchema(parameter.schema, spec),
      };
    });

  const queryParams = parameters
    .filter(function isQueryParameter(parameter) {
      return parameter.in === "query" && Boolean(parameter.name);
    })
    .map(function mapQueryParameter(parameter) {
      return {
        name: parameter.name ?? "",
        required: Boolean(parameter.required),
        schema: summarizeLeafSchema(parameter.schema, spec),
      };
    });

  const bodySchema = getRequestBodySchema(operation.requestBody);

  return {
    operationId: operation.operationId ?? null,
    title:
      operation.summary ??
      operation.operationId ??
      `${method.toUpperCase()} ${path}`,
    method: method.toUpperCase(),
    path,
    tags: operation.tags ?? [],
    description: operation.description ?? null,
    pathParams,
    queryParams,
    body: operation.requestBody
      ? {
          required: Boolean(operation.requestBody.required),
          contentTypes: getBodyContentTypes(operation.requestBody),
          schema: summarizeSchema(bodySchema, spec),
        }
      : null,
  };
}

function listOperations(spec: OpenApiSpec): OperationMatch[] {
  const operations: OperationMatch[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation) {
        continue;
      }

      if (
        method !== "delete" &&
        method !== "get" &&
        method !== "patch" &&
        method !== "post" &&
        method !== "put"
      ) {
        continue;
      }

      operations.push({
        method,
        path,
        operation,
      });
    }
  }

  return operations;
}

function buildOperationText(match: OperationMatch): string {
  return normalizeText(
    [
      match.operation.operationId ?? "",
      match.operation.summary ?? "",
      match.operation.description ?? "",
      match.path,
      ...(match.operation.tags ?? []),
    ].join(" "),
  );
}

function scoreOperation(
  match: OperationMatch,
  query: string,
  pathPrefix?: string,
  method?: string,
): number {
  if (method && match.method.toUpperCase() !== method) {
    return -1;
  }

  if (pathPrefix && !match.path.startsWith(normalizeApiPath(pathPrefix))) {
    return -1;
  }

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const queryWords = tokenize(query);
  const operationText = buildOperationText(match);
  const operationIdText = normalizeText(match.operation.operationId ?? "");
  const pathText = normalizeText(match.path);

  let score = 0;

  if (operationText.includes(normalizedQuery)) {
    score += 80;
  }

  if (pathText.includes(normalizedQuery)) {
    score += 50;
  }

  if (operationIdText.startsWith(normalizedQuery)) {
    score += 40;
  }

  for (const word of queryWords) {
    if (operationText.includes(word)) {
      score += 12;
    }

    if (pathText.includes(word)) {
      score += 6;
    }
  }

  return score;
}

function findOperationByOperationId(
  spec: OpenApiSpec,
  operationId: string,
): OperationMatch | null {
  for (const match of listOperations(spec)) {
    if (match.operation.operationId === operationId) {
      return match;
    }
  }

  return null;
}

function findOperationByMethodAndPath(
  spec: OpenApiSpec,
  method: string,
  path: string,
): OperationMatch | null {
  const normalizedPath = normalizeApiPath(path);
  const normalizedMethod = method.toLowerCase();

  if (
    normalizedMethod !== "delete" &&
    normalizedMethod !== "get" &&
    normalizedMethod !== "patch" &&
    normalizedMethod !== "post" &&
    normalizedMethod !== "put"
  ) {
    return null;
  }

  const operation = spec.paths[normalizedPath]?.[normalizedMethod];
  if (!operation) {
    return null;
  }

  return {
    method: normalizedMethod,
    path: normalizedPath,
    operation,
  };
}

function replacePathParams(
  path: string,
  pathParams: Record<string, string | number | boolean> | undefined,
): { path: string; missing: string[] } {
  const matches = Array.from(path.matchAll(/\{([^}]+)\}/g));
  const missing: string[] = [];
  let resolvedPath = path;

  for (const match of matches) {
    const name = match[1];
    const value = pathParams?.[name];

    if (value === undefined) {
      missing.push(name);
      continue;
    }

    resolvedPath = resolvedPath.replace(
      `{${name}}`,
      encodeURIComponent(String(value)),
    );
  }

  return { path: resolvedPath, missing };
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: z.infer<typeof queryValueSchema>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, String(item));
    }
    return;
  }

  searchParams.append(key, String(value));
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function registerTools(server: McpServer) {
  server.tool(
    "search",
    "Search Frost API operations from the OpenAPI spec",
    {
      query: z.string().optional().default(""),
      method: methodSchema.optional(),
      pathPrefix: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async function search({ query, method, pathPrefix, limit }) {
      const spec = await getOpenApiSpec();
      const matches = listOperations(spec)
        .map(function mapOperation(match) {
          return {
            match,
            score: scoreOperation(match, query, pathPrefix, method),
          };
        })
        .filter(function filterScoredMatch(result) {
          return normalizeText(query) ? result.score > 0 : result.score >= 0;
        })
        .sort(function sortMatches(a, b) {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          if (a.match.path !== b.match.path) {
            return a.match.path.localeCompare(b.match.path);
          }

          return a.match.method.localeCompare(b.match.method);
        })
        .slice(0, limit)
        .map(function mapResult(result) {
          return buildSearchResult(
            result.match.method,
            result.match.path,
            result.match.operation,
            spec,
          );
        });

      return textResult(matches);
    },
  );

  server.tool(
    "request",
    "Call a Frost API operation from the OpenAPI spec",
    {
      operationId: z.string().optional(),
      method: methodSchema.optional(),
      path: z.string().optional(),
      pathParams: z.record(z.string(), scalarSchema).optional(),
      query: z.record(z.string(), queryValueSchema).optional(),
      body: z.unknown().optional(),
    },
    async function request({
      operationId,
      method,
      path,
      pathParams,
      query,
      body,
    }) {
      const spec = await getOpenApiSpec();

      let match: OperationMatch | null = null;

      if (operationId) {
        match = findOperationByOperationId(spec, operationId);
        if (!match) {
          return errorResult("Operation not found", { operationId });
        }
      } else {
        if (!method || !path) {
          return errorResult("Provide operationId or method and path");
        }

        match = findOperationByMethodAndPath(spec, method, path);
        if (!match) {
          return errorResult("Operation not found", {
            method,
            path: normalizeApiPath(path),
          });
        }
      }

      const resolvedPath = replacePathParams(match.path, pathParams);
      if (resolvedPath.missing.length > 0) {
        return errorResult("Missing path parameters", {
          operationId: match.operation.operationId ?? null,
          method: match.method.toUpperCase(),
          path: match.path,
          missing: resolvedPath.missing,
        });
      }

      if (body !== undefined && !match.operation.requestBody) {
        return errorResult("Operation does not accept a request body", {
          operationId: match.operation.operationId ?? null,
          method: match.method.toUpperCase(),
          path: match.path,
        });
      }

      if (body === undefined && match.operation.requestBody?.required) {
        return errorResult("Request body is required", {
          operationId: match.operation.operationId ?? null,
          method: match.method.toUpperCase(),
          path: match.path,
        });
      }

      const contentTypes = getBodyContentTypes(match.operation.requestBody);
      if (
        body !== undefined &&
        contentTypes.length > 0 &&
        !contentTypes.some(function isJson(type) {
          return type.includes("application/json");
        })
      ) {
        return errorResult(
          "Only application/json request bodies are supported",
          {
            operationId: match.operation.operationId ?? null,
            method: match.method.toUpperCase(),
            path: match.path,
            contentTypes,
          },
        );
      }

      const url = new URL(`http://frost.internal/api${resolvedPath.path}`);
      for (const [key, value] of Object.entries(query ?? {})) {
        appendQueryValue(url.searchParams, key, value);
      }

      const headers = new Headers({
        Accept: "application/json",
      });

      let requestBody: string | undefined;
      if (body !== undefined) {
        headers.set("Content-Type", "application/json");
        requestBody = JSON.stringify(body);
      }

      const response = await handleOpenApiRequest(
        new Request(url, {
          method: match.method.toUpperCase(),
          headers,
          body: requestBody,
        }),
      );

      const data = await parseResponseBody(response);
      const payload = {
        operationId: match.operation.operationId ?? null,
        method: match.method.toUpperCase(),
        path: resolvedPath.path,
        status: response.status,
        ok: response.ok,
        requestId: response.headers.get("x-request-id"),
        data,
      };

      if (!response.ok) {
        return errorResult("API request failed", payload);
      }

      return textResult(payload);
    },
  );
}
