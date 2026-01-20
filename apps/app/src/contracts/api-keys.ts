import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiKeysSchema } from "@/lib/db-schemas";

const apiKeyOutputSchema = apiKeysSchema.omit({ keyHash: true });

export const apiKeysContract = {
  list: oc
    .route({ method: "GET", path: "/settings/api-keys" })
    .output(z.array(apiKeyOutputSchema)),

  create: oc
    .route({ method: "POST", path: "/settings/api-keys" })
    .input(z.object({ name: z.string().min(1) }))
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        key: z.string(),
      }),
    ),

  delete: oc
    .route({ method: "DELETE", path: "/settings/api-keys/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() })),
};
