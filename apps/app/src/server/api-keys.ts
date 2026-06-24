import { generateApiKey, hashApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { newApiKeyId } from "@/lib/id";
import {
  isSystemApiKeyName,
  SYSTEM_API_KEY_NAME_PREFIX,
} from "@/lib/system-api-keys";
import { assertDemoWriteAllowed } from "./demo-guards";
import { os } from "./orpc";

export const apiKeys = {
  list: os.apiKeys.list.handler(() =>
    db
      .selectFrom("apiKeys")
      .select(["id", "name", "keyPrefix", "createdAt", "lastUsedAt"])
      .where("name", "not like", `${SYSTEM_API_KEY_NAME_PREFIX}%`)
      .orderBy("createdAt", "desc")
      .execute(),
  ),

  create: os.apiKeys.create.handler(async ({ input }) => {
    assertDemoWriteAllowed("api key changes");
    if (isSystemApiKeyName(input.name)) {
      throw new Error("API key names starting with system: are reserved");
    }

    const id = newApiKeyId();
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

    await db
      .deleteFrom("apiKeys")
      .where("id", "=", input.id)
      .where("name", "not like", `${SYSTEM_API_KEY_NAME_PREFIX}%`)
      .execute();
    return { success: true };
  }),
};
