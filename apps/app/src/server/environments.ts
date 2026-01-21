import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { deployEnvironment } from "@/lib/deployer";
import { cleanupEnvironment } from "@/lib/webhook";
import { os } from "./orpc";

export const environments = {
  list: os.environments.list.handler(async ({ input }) => {
    return db
      .selectFrom("environments")
      .selectAll()
      .where("projectId", "=", input.projectId)
      .orderBy("createdAt", "asc")
      .execute();
  }),

  get: os.environments.get.handler(async ({ input }) => {
    const environment = await db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("NOT_FOUND", { message: "Environment not found" });
    }

    const services = await db
      .selectFrom("services")
      .selectAll()
      .where("environmentId", "=", input.id)
      .execute();

    const servicesWithDeployments = await Promise.all(
      services.map(async (service) => {
        const latestDeployment = await db
          .selectFrom("deployments")
          .selectAll()
          .where("serviceId", "=", service.id)
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();

        return { ...service, latestDeployment: latestDeployment ?? null };
      }),
    );

    return { ...environment, services: servicesWithDeployments };
  }),

  create: os.environments.create.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", input.projectId)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const existing = await db
      .selectFrom("environments")
      .select("id")
      .where("projectId", "=", input.projectId)
      .where("name", "=", input.name)
      .executeTakeFirst();

    if (existing) {
      throw new ORPCError("CONFLICT", {
        message: "Environment with this name already exists",
      });
    }

    const id = nanoid();
    const now = Date.now();

    await db
      .insertInto("environments")
      .values({
        id,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        isEphemeral: false,
        createdAt: now,
      })
      .execute();

    const environment = await db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create environment",
      });
    }

    return environment;
  }),

  delete: os.environments.delete.handler(async ({ input }) => {
    const environment = await db
      .selectFrom("environments")
      .select(["id", "projectId", "type"])
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("NOT_FOUND", { message: "Environment not found" });
    }

    if (environment.type === "production") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Cannot delete production environment",
      });
    }

    await cleanupEnvironment(environment);
    return { success: true };
  }),

  deploy: os.environments.deploy.handler(async ({ input }) => {
    const environment = await db
      .selectFrom("environments")
      .select("id")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("NOT_FOUND", { message: "Environment not found" });
    }

    const deploymentIds = await deployEnvironment(input.id);
    return { deploymentIds };
  }),
};
