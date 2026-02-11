import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { dockerLogin, getRegistryUrl } from "@/lib/docker";
import { assertDemoWriteAllowed } from "./demo-guards";
import { os } from "./orpc";

type RegistryType = "ghcr" | "dockerhub" | "custom";

export const registries = {
  list: os.registries.list.handler(async () => {
    const rows = await db
      .selectFrom("registries")
      .select(["id", "name", "type", "url", "username", "createdAt"])
      .orderBy("createdAt", "desc")
      .execute();
    return rows.map((row) => ({ ...row, type: row.type as RegistryType }));
  }),

  create: os.registries.create.handler(async ({ input }) => {
    assertDemoWriteAllowed("registry changes");

    if (input.type === "custom" && !input.url) {
      throw new ORPCError("BAD_REQUEST", {
        message: "URL is required for custom registries",
      });
    }

    const registryUrl = getRegistryUrl(input.type, input.url ?? null);
    const loginResult = await dockerLogin(
      registryUrl,
      input.username,
      input.password,
    );
    if (!loginResult.success) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid registry credentials: ${loginResult.error}`,
      });
    }

    const id = nanoid();
    const now = Date.now();
    const passwordEncrypted = encrypt(input.password);

    await db
      .insertInto("registries")
      .values({
        id,
        name: input.name,
        type: input.type,
        url: input.url ?? null,
        username: input.username,
        passwordEncrypted,
        createdAt: now,
      })
      .execute();

    return {
      id,
      name: input.name,
      type: input.type,
      url: input.url ?? null,
      username: input.username,
      createdAt: now,
    };
  }),

  update: os.registries.update.handler(async ({ input }) => {
    assertDemoWriteAllowed("registry changes");

    const existing = await db
      .selectFrom("registries")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Registry not found" });
    }

    if (input.password) {
      const registryUrl = getRegistryUrl(existing.type, existing.url);
      const username = input.username ?? existing.username;
      const loginResult = await dockerLogin(
        registryUrl,
        username,
        input.password,
      );
      if (!loginResult.success) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Invalid registry credentials: ${loginResult.error}`,
        });
      }
    }

    const updates: Record<string, unknown> = {};
    if (input.name) updates.name = input.name;
    if (input.username) updates.username = input.username;
    if (input.password) updates.passwordEncrypted = encrypt(input.password);

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("registries")
        .set(updates)
        .where("id", "=", input.id)
        .execute();
    }

    const updated = await db
      .selectFrom("registries")
      .select(["id", "name", "type", "url", "username", "createdAt"])
      .where("id", "=", input.id)
      .executeTakeFirstOrThrow();

    return { ...updated, type: updated.type as RegistryType };
  }),

  delete: os.registries.delete.handler(async ({ input }) => {
    assertDemoWriteAllowed("registry changes");

    const servicesUsingRegistry = await db
      .selectFrom("services")
      .select("id")
      .where("registryId", "=", input.id)
      .execute();

    if (servicesUsingRegistry.length > 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Registry is in use by ${servicesUsingRegistry.length} service(s)`,
      });
    }

    await db.deleteFrom("registries").where("id", "=", input.id).execute();
    return { success: true };
  }),
};
