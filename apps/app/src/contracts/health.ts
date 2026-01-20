import { oc } from "@orpc/contract";
import { z } from "zod";

export const healthContract = {
  check: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ ok: z.boolean(), version: z.string() })),

  hostResources: oc
    .route({ method: "GET", path: "/host-resources" })
    .output(z.object({ cpus: z.number(), totalMemoryGB: z.number() })),
};
