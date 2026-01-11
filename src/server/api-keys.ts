import { nanoid } from "nanoid";
import { z } from "zod";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeySchema } from "@/lib/db-schemas";
import { os } from "@/lib/orpc";

const apiKeyOutputSchema = apiKeySchema.omit({ keyHash: true });

export const apiKeys = {
  list: os
    .route({ method: "GET", path: "/settings/api-keys" })
    .output(z.array(apiKeyOutputSchema))
    .handler(async () => {
      const keys = await db
        .selectFrom("apiKeys")
        .select(["id", "name", "keyPrefix", "createdAt", "lastUsedAt"])
        .orderBy("createdAt", "desc")
        .execute();
      return keys;
    }),

  create: os
    .route({ method: "POST", path: "/settings/api-keys" })
    .input(z.object({ name: z.string().min(1) }))
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        key: z.string(),
      }),
    )
    .handler(async ({ input }) => {
      const id = nanoid();
      const key = generateApiKey();
      const keyHash = hashApiKey(key);
      const keyPrefix = key.slice(0, 12);

      await db
        .insertInto("apiKeys")
        .values({
          id,
          name: input.name,
          keyPrefix,
          keyHash,
        })
        .execute();

      return { id, name: input.name, key };
    }),

  delete: os
    .route({ method: "DELETE", path: "/settings/api-keys/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      await db.deleteFrom("apiKeys").where("id", "=", input.id).execute();
      return { success: true };
    }),
};
