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
};
