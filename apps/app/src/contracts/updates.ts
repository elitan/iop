import { oc } from "@orpc/contract";
import { z } from "zod";

const updateStatusSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  lastCheck: z.string().nullable(),
  restarting: z.boolean(),
  changelog: z.string().nullable(),
});

export const updatesContract = {
  get: oc.route({ method: "GET", path: "/updates" }).output(updateStatusSchema),

  check: oc
    .route({ method: "POST", path: "/updates" })
    .output(updateStatusSchema),

  apply: oc
    .route({ method: "POST", path: "/updates/apply" })
    .output(z.object({ success: z.boolean() })),

  getResult: oc.route({ method: "GET", path: "/updates/result" }).output(
    z.object({
      completed: z.boolean(),
      success: z.boolean(),
      newVersion: z.string().nullable(),
      log: z.string().nullable(),
    }),
  ),

  clearResult: oc
    .route({ method: "DELETE", path: "/updates/result" })
    .output(z.object({ success: z.boolean() })),

  getAutoUpdate: oc
    .route({ method: "GET", path: "/updates/auto" })
    .output(z.object({ enabled: z.boolean(), hour: z.number() })),

  updateAutoUpdate: oc
    .route({ method: "POST", path: "/updates/auto" })
    .input(
      z.object({
        enabled: z.boolean().optional(),
        hour: z.number().min(0).max(23).optional(),
      }),
    )
    .output(z.object({ enabled: z.boolean(), hour: z.number() })),
};
