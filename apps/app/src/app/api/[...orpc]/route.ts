import { getOpenApiSpec, handleOpenApiRequest } from "@/lib/openapi";

async function handleRequest(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/openapi.json") {
    const spec = await getOpenApiSpec();
    return Response.json(spec);
  }

  return handleOpenApiRequest(request);
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const PUT = handleRequest;
