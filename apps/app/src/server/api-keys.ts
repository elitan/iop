import { nanoid } from "nanoid";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertDemoWriteAllowed } from "./demo-guards";
import { os } from "./orpc";

export const apiKeys = {
  list: os.apiKeys.list.handler(() =>
    db
      .selectFrom("apiKeys")
      .select(["id", "name", "keyPrefix", "createdAt", "lastUsedAt"])
      .orderBy("createdAt", "desc")
      .execute(),
  ),

  create: os.apiKeys.create.handler(async ({ input }) => {
    assertDemoWriteAllowed("api key changes");

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

  delete: os.apiKeys.delete.handler(async ({ input }) => {
    assertDemoWriteAllowed("api key changes");

    await db.deleteFrom("apiKeys").where("id", "=", input.id).execute();
    return { success: true };
  }),
};
