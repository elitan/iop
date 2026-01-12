import * as nodeOs from "node:os";
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

  hostResources: os
    .route({ method: "GET", path: "/host-resources" })
    .output(z.object({ cpus: z.number(), totalMemoryGB: z.number() }))
    .handler(async () => {
      const cpus = nodeOs.cpus().length;
      const totalMemoryGB = Math.floor(nodeOs.totalmem() / 1024 / 1024 / 1024);
      return { cpus, totalMemoryGB };
    }),
};
