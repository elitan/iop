import { oc } from "@orpc/contract";
import { z } from "zod";

const cleanupSettingsSchema = z.object({
  enabled: z.boolean(),
  schedule: z.string(),
  retentionDays: z.number(),
  running: z.boolean(),
  lastRun: z.string().nullable(),
  lastResult: z.string().nullable(),
});

export const cleanupContract = {
  get: oc
    .route({ method: "GET", path: "/cleanup" })
    .output(cleanupSettingsSchema),

  update: oc
    .route({ method: "POST", path: "/cleanup" })
    .input(
      z.object({
        enabled: z.boolean().optional(),
        schedule: z.string().optional(),
        retentionDays: z.number().optional(),
      }),
    )
    .output(cleanupSettingsSchema),

  runStatus: oc.route({ method: "GET", path: "/cleanup/run" }).output(
    z.object({
      running: z.boolean(),
      lastRun: z.string().nullable(),
      result: z.string().nullable(),
    }),
  ),

  runStart: oc
    .route({ method: "POST", path: "/cleanup/run" })
    .output(z.object({ started: z.boolean() })),
};
