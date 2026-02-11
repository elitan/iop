import { db } from "@/lib/db";
import { assertDemoWriteAllowed } from "./demo-guards";
import { os } from "./orpc";

export const mcpTokens = {
  list: os.mcpTokens.list.handler(() =>
    db
      .selectFrom("oauthTokens")
      .innerJoin(
        "oauthClients",
        "oauthClients.clientId",
        "oauthTokens.clientId",
      )
      .select([
        "oauthTokens.id",
        "oauthClients.clientName",
        "oauthTokens.expiresAt",
        "oauthTokens.createdAt",
      ])
      .orderBy("oauthTokens.createdAt", "desc")
      .execute(),
  ),

  delete: os.mcpTokens.delete.handler(async ({ input }) => {
    assertDemoWriteAllowed("mcp token changes");

    const token = await db
      .selectFrom("oauthTokens")
      .select("clientId")
      .where("id", "=", input.id)
      .executeTakeFirst();

    await db.deleteFrom("oauthTokens").where("id", "=", input.id).execute();

    if (token) {
      const remaining = await db
        .selectFrom("oauthTokens")
        .select("id")
        .where("clientId", "=", token.clientId)
        .executeTakeFirst();

      if (!remaining) {
        await db
          .deleteFrom("oauthClients")
          .where("clientId", "=", token.clientId)
          .execute();
      }
    }

    return { success: true };
  }),
};
