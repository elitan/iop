import { os as baseOs, onError } from "@orpc/server";
import type { Context } from "@/server/context";

export const os = baseOs
  .$context<Context>()
  .use(async ({ context, next }) => {
    const start = Date.now();
    const result = await next();
    const duration = Date.now() - start;
    console.log(`[${context.requestId}] ${duration}ms`);
    return result;
  })
  .use(
    onError((error, { context }) => {
      const requestId = context.requestId ?? "unknown";
      console.error(`[${requestId}] API Error:`, error);
      if (error.cause) {
        console.error(`[${requestId}] Cause:`, error.cause);
      }
    }),
  );
