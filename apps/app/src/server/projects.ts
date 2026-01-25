import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { getSetting } from "@/lib/auth";
import { db } from "@/lib/db";
import { deployProject, deployService } from "@/lib/deployer";
import { removeNetwork, stopContainer } from "@/lib/docker";
import { createService } from "@/lib/services";
import { slugify } from "@/lib/slugify";
import { getTemplate, resolveTemplateServices } from "@/lib/templates";
import { os } from "./orpc";

export const projects = {
  list: os.projects.list.handler(async () => {
    const [projectRows, domain] = await Promise.all([
      db.selectFrom("projects").selectAll().execute(),
      getSetting("domain"),
    ]);

    return Promise.all(
      projectRows.map(async (project) => {
        const productionEnv = await db
          .selectFrom("environments")
          .select("id")
          .where("projectId", "=", project.id)
          .where("type", "=", "production")
          .executeTakeFirst();

        const services = productionEnv
          ? await db
              .selectFrom("services")
              .selectAll()
              .where("environmentId", "=", productionEnv.id)
              .execute()
          : [];

        const latestDeploymentByService: Record<
          string,
          { status: string } | undefined
        > = {};
        if (productionEnv && services.length > 0) {
          const deployments = await db
            .selectFrom("deployments")
            .select(["serviceId", "status", "createdAt"])
            .where("environmentId", "=", productionEnv.id)
            .orderBy("createdAt", "desc")
            .execute();

          for (const d of deployments) {
            if (!latestDeploymentByService[d.serviceId]) {
              latestDeploymentByService[d.serviceId] = { status: d.status };
            }
          }
        }

        const latestDeployment = productionEnv
          ? await db
              .selectFrom("deployments")
              .innerJoin("services", "services.id", "deployments.serviceId")
              .select([
                "deployments.status",
                "deployments.commitMessage",
                "deployments.createdAt",
                "services.branch",
              ])
              .where("deployments.environmentId", "=", productionEnv.id)
              .orderBy("deployments.createdAt", "desc")
              .executeTakeFirst()
          : null;

        const runningDeployment = productionEnv
          ? await db
              .selectFrom("deployments")
              .select(["hostPort"])
              .where("environmentId", "=", productionEnv.id)
              .where("status", "=", "running")
              .where("hostPort", "is not", null)
              .executeTakeFirst()
          : null;

        const repoUrl = services[0]?.repoUrl ?? null;

        let runningUrl: string | null = null;
        if (runningDeployment?.hostPort) {
          runningUrl = domain
            ? `${domain}:${runningDeployment.hostPort}`
            : `localhost:${runningDeployment.hostPort}`;
        }

        return {
          ...project,
          servicesCount: services.length,
          latestDeployment: latestDeployment
            ? {
                status: latestDeployment.status,
                commitMessage: latestDeployment.commitMessage,
                createdAt: latestDeployment.createdAt,
                branch: latestDeployment.branch,
              }
            : null,
          repoUrl,
          runningUrl,
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            icon: s.icon,
            imageUrl: s.imageUrl,
            deployType: s.deployType,
            status: latestDeploymentByService[s.id]?.status ?? null,
          })),
        };
      }),
    );
  }),

  get: os.projects.get.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const productionEnv = await db
      .selectFrom("environments")
      .select("id")
      .where("projectId", "=", input.id)
      .where("type", "=", "production")
      .executeTakeFirst();

    const services = productionEnv
      ? await db
          .selectFrom("services")
          .selectAll()
          .where("environmentId", "=", productionEnv.id)
          .execute()
      : [];

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

    return { ...project, services: servicesWithDeployments };
  }),

  create: os.projects.create.handler(async ({ input }) => {
    if (input.templateId) {
      const template = getTemplate(input.templateId);
      if (!template) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Unknown template",
        });
      }
      if (template.type !== "project") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Template is not a project template",
        });
      }
    }

    const id = nanoid();
    const now = Date.now();
    const hostname = slugify(input.name);

    await db
      .insertInto("projects")
      .values({
        id,
        name: input.name,
        hostname,
        envVars: JSON.stringify(input.envVars),
        createdAt: now,
      })
      .execute();

    const envId = nanoid();
    await db
      .insertInto("environments")
      .values({
        id: envId,
        projectId: id,
        name: "production",
        type: "production",
        isEphemeral: false,
        createdAt: now,
      })
      .execute();

    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create project",
      });
    }

    if (input.templateId) {
      const template = getTemplate(input.templateId)!;
      const resolved = resolveTemplateServices(template);

      for (const svc of resolved) {
        const serviceHostname = slugify(svc.name);

        const service = await createService({
          environmentId: envId,
          name: svc.name,
          hostname: serviceHostname,
          deployType: "image",
          serviceType: svc.isDatabase ? "database" : "app",
          imageUrl: svc.image,
          envVars: svc.envVars,
          containerPort: svc.port,
          healthCheckPath: svc.healthCheckPath,
          healthCheckTimeout: svc.healthCheckTimeout,
          volumes: svc.volumes,
          command: svc.command,
          icon: svc.icon,
          ssl: svc.ssl,
          wildcardDomain: svc.isDatabase
            ? undefined
            : { projectHostname: hostname },
        });

        deployService(service.id).catch((err) => {
          console.error(`Auto-deploy failed for service ${service.id}:`, err);
        });
      }
    }

    return project;
  }),

  update: os.projects.update.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.envVars !== undefined) {
      updates.envVars = JSON.stringify(input.envVars);
    }
    if (input.canvasPositions !== undefined) {
      updates.canvasPositions = input.canvasPositions;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("projects")
        .set(updates)
        .where("id", "=", input.id)
        .execute();
    }

    const updated = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    return updated;
  }),

  delete: os.projects.delete.handler(async ({ input }) => {
    const environments = await db
      .selectFrom("environments")
      .select("id")
      .where("projectId", "=", input.id)
      .execute();

    for (const env of environments) {
      const deployments = await db
        .selectFrom("deployments")
        .select(["id", "containerId"])
        .where("environmentId", "=", env.id)
        .execute();

      for (const deployment of deployments) {
        if (deployment.containerId) {
          await stopContainer(deployment.containerId);
        }
      }

      await removeNetwork(`frost-net-${input.id}-${env.id}`.toLowerCase());
    }

    await db.deleteFrom("projects").where("id", "=", input.id).execute();

    return { success: true };
  }),

  deploy: os.projects.deploy.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const deploymentIds = await deployProject(input.id);
    return { deploymentIds };
  }),
};
