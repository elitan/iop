import { implement, onError } from "@orpc/server";
import { contract } from "@/contracts";
import type { Context } from "@/server/context";

export const os = implement(contract)
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
      console.error(`[${context.requestId}] API Error:`, error);
      if (error.cause) {
        console.error(`[${context.requestId}] Cause:`, error.cause);
      }
    }),
  );
