import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { router } from "@/server";
import type { Context } from "@/server/context";

const handler = new OpenAPIHandler<Context>(router);

async function handleRequest(request: Request) {
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
