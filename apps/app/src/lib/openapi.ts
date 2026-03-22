import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { nanoid } from "nanoid";
import { router } from "@/server";
import type { Context } from "@/server/context";

export type OpenApiMethod = "delete" | "get" | "patch" | "post" | "put";

export interface OpenApiSchema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
}

export interface OpenApiParameter {
  $ref?: string;
  name?: string;
  in?: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiRequestBodyContent {
  schema?: OpenApiSchema;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, OpenApiRequestBodyContent>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  components?: Record<string, unknown>;
}

const handler = new OpenAPIHandler<Context>(router);

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

let specCache: OpenApiSpec | null = null;

export async function getOpenApiSpec(): Promise<OpenApiSpec> {
  if (!specCache) {
    specCache = (await generator.generate(router, {
      info: {
        title: "Frost API",
        version: "1.0.0",
        description: "API for Frost deployment platform",
      },
      servers: [{ url: "/api" }],
    })) as OpenApiSpec;
  }

  return specCache;
}

export async function handleOpenApiRequest(
  request: Request,
): Promise<Response> {
  const requestId = nanoid(10);
  const { matched, response } = await handler.handle(request, {
    prefix: "/api",
    context: { headers: request.headers, requestId },
  });

  if (matched && response) {
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response("Not Found", { status: 404 });
}
