import { z } from "zod";
import { os } from "@/lib/orpc";
import packageJson from "../../package.json";

export const health = {
  check: os
    .route({ method: "GET", path: "/health" })
    .output(z.object({ ok: z.boolean(), version: z.string() }))
    .handler(async () => {
      return { ok: true, version: packageJson.version };
    }),
};
