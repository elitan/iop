import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { deployEnvironment } from "@/lib/deployer";
import { createWildcardDomain } from "@/lib/domains";
import { slugify } from "@/lib/slugify";
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
      .select(["id", "hostname", "name"])
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

    let shouldDeploy = false;

    if (input.cloneFromEnvironmentId) {
      const sourceEnv = await db
        .selectFrom("environments")
        .select("id")
        .where("id", "=", input.cloneFromEnvironmentId)
        .where("projectId", "=", input.projectId)
        .executeTakeFirst();

      if (sourceEnv) {
        const sourceServices = await db
          .selectFrom("services")
          .selectAll()
          .where("environmentId", "=", sourceEnv.id)
          .execute();

        const projectHostname = project.hostname ?? slugify(project.name);
        const envName = slugify(input.name);

        for (const service of sourceServices) {
          const serviceId = nanoid();
          const hostname = service.hostname ?? slugify(service.name);

          await db
            .insertInto("services")
            .values({
              id: serviceId,
              environmentId: id,
              name: service.name,
              hostname,
              deployType: service.deployType,
              serviceType: service.serviceType,
              repoUrl: service.repoUrl,
              branch: service.branch,
              dockerfilePath: service.dockerfilePath,
              buildContext: service.buildContext,
              imageUrl: service.imageUrl,
              envVars: service.envVars,
              containerPort: service.containerPort,
              healthCheckPath: service.healthCheckPath,
              healthCheckTimeout: service.healthCheckTimeout,
              memoryLimit: service.memoryLimit,
              cpuLimit: service.cpuLimit,
              shutdownTimeout: service.shutdownTimeout,
              registryId: service.registryId,
              command: service.command,
              volumes: service.volumes,
              autoDeploy: false,
              createdAt: now,
            })
            .execute();

          await createWildcardDomain(
            serviceId,
            id,
            hostname,
            projectHostname,
            envName,
          );
        }

        if (sourceServices.length > 0) {
          shouldDeploy = true;
        }
      }
    }

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

    if (shouldDeploy) {
      deployEnvironment(id).catch(console.error);
    }

    return environment;
  }),

  update: os.environments.update.handler(async ({ input }) => {
    const environment = await db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("NOT_FOUND", { message: "Environment not found" });
    }

    if (input.name && input.name !== environment.name) {
      const existing = await db
        .selectFrom("environments")
        .select("id")
        .where("projectId", "=", environment.projectId)
        .where("name", "=", input.name)
        .where("id", "!=", input.id)
        .executeTakeFirst();

      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Environment with this name already exists",
        });
      }
    }

    await db
      .updateTable("environments")
      .set({
        name: input.name ?? environment.name,
      })
      .where("id", "=", input.id)
      .execute();

    const updated = await db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to update environment",
      });
    }

    return updated;
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
