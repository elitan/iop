import { oc } from "@orpc/contract";
import { z } from "zod";
import { registryOutputSchema } from "@/lib/db-schemas";

export const registriesContract = {
  list: oc
    .route({ method: "GET", path: "/registries" })
    .output(z.array(registryOutputSchema)),

  create: oc
    .route({ method: "POST", path: "/registries" })
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["ghcr", "dockerhub", "custom"]),
        url: z.string().optional(),
        username: z.string().min(1),
        password: z.string().min(1),
      }),
    )
    .output(registryOutputSchema),

  update: oc
    .route({ method: "PATCH", path: "/registries/{id}" })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
      }),
    )
    .output(registryOutputSchema),

  delete: oc
    .route({ method: "DELETE", path: "/registries/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() })),
};
