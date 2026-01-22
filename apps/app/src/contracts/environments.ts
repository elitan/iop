import { oc } from "@orpc/contract";
import { z } from "zod";
import { environmentsSchema } from "@/lib/db-schemas";
import { serviceWithDeploymentSchema } from "./shared";

const environmentWithServicesSchema = environmentsSchema.extend({
  services: z.array(serviceWithDeploymentSchema),
});

export const environmentsContract = {
  list: oc
    .route({ method: "GET", path: "/projects/{projectId}/environments" })
    .input(z.object({ projectId: z.string() }))
    .output(z.array(environmentsSchema)),

  get: oc
    .route({ method: "GET", path: "/environments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(environmentWithServicesSchema),

  create: oc
    .route({ method: "POST", path: "/projects/{projectId}/environments" })
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        type: z.enum(["manual"]).default("manual"),
        cloneFromEnvironmentId: z.string().optional(),
      }),
    )
    .output(environmentsSchema),

  update: oc
    .route({ method: "PATCH", path: "/environments/{id}" })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
      }),
    )
    .output(environmentsSchema),

  delete: oc
    .route({ method: "DELETE", path: "/environments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() })),

  deploy: oc
    .route({ method: "POST", path: "/environments/{id}/deploy" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentIds: z.array(z.string()) })),
};
