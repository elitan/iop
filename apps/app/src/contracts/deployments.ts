import { oc } from "@orpc/contract";
import { z } from "zod";
import { deploymentsSchema, replicasSchema } from "@/lib/db-schemas";

export const deploymentsContract = {
  get: oc
    .route({ method: "GET", path: "/deployments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(deploymentsSchema),

  listByEnvironment: oc
    .route({ method: "GET", path: "/environments/{environmentId}/deployments" })
    .input(z.object({ environmentId: z.string() }))
    .output(z.array(deploymentsSchema)),

  rollback: oc
    .route({ method: "POST", path: "/deployments/{id}/rollback" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentId: z.string() })),

  getReplicas: oc
    .route({ method: "GET", path: "/deployments/{id}/replicas" })
    .input(z.object({ id: z.string() }))
    .output(z.array(replicasSchema)),
};
