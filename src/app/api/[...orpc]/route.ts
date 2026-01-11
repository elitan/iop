import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "@/server";
import type { Context } from "@/server/context";

const handler = new OpenAPIHandler<Context>(router);

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

let specCache: object | null = null;

async function getSpec() {
  if (!specCache) {
    specCache = await generator.generate(router, {
      info: {
        title: "Frost API",
        version: "1.0.0",
        description: "API for Frost deployment platform",
      },
      servers: [{ url: "/api" }],
    });
  }
  return specCache;
}

async function handleRequest(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/openapi.json") {
    const spec = await getSpec();
    return Response.json(spec);
  }

  const { matched, response } = await handler.handle(request, {
    prefix: "/api",
    context: { headers: request.headers },
  });

  if (matched) {
    return response;
  }

  return new Response("Not Found", { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const PUT = handleRequest;
