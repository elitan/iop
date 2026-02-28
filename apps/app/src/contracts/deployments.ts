import { oc } from "@orpc/contract";
import { z } from "zod";
import { deploymentsSchema, replicasSchema } from "@/lib/db-schemas";

export const deploymentsContract = {
  get: oc
    .route({ method: "GET", path: "/deployments/{deploymentId}" })
    .input(z.object({ deploymentId: z.string() }))
    .output(deploymentsSchema),

  listByEnvironment: oc
    .route({ method: "GET", path: "/environments/{environmentId}/deployments" })
    .input(z.object({ environmentId: z.string() }))
    .output(z.array(deploymentsSchema)),

  rollback: oc
    .route({ method: "POST", path: "/deployments/{deploymentId}/rollback" })
    .input(z.object({ deploymentId: z.string() }))
    .output(z.object({ deploymentId: z.string() })),

  getReplicas: oc
    .route({ method: "GET", path: "/deployments/{deploymentId}/replicas" })
    .input(z.object({ deploymentId: z.string() }))
    .output(z.array(replicasSchema)),
};
