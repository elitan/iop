import { oc } from "@orpc/contract";
import { z } from "zod";
import { deploymentsSchema } from "@/lib/db-schemas";

export const deploymentsContract = {
  get: oc
    .route({ method: "GET", path: "/deployments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(deploymentsSchema),

  rollback: oc
    .route({ method: "POST", path: "/deployments/{id}/rollback" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentId: z.string() })),
};
