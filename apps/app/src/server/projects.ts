import { ORPCError } from "@orpc/server";
import { getSetting } from "@/lib/auth";
import { buildPostgresConnectionString } from "@/lib/connection-strings";
import {
  createDatabase,
  getDatabaseTargetConnectionInfo,
  listDatabasesWithRuntimeByProject,
} from "@/lib/database-runtime";
import { db } from "@/lib/db";
import { deployProject, deployService } from "@/lib/deployer";
import { addLatestDeploymentsWithRuntimeStatus } from "@/lib/deployment-runtime";
import { newEnvironmentId, newProjectId } from "@/lib/id";
import { cleanupProject } from "@/lib/lifecycle";
import { getProjectResourceSummary } from "@/lib/project-resource-summary";
import { createService } from "@/lib/services";
import { slugify } from "@/lib/slugify";
import {
  getManagedTemplateDatabases,
  getTemplate,
  resolveTemplateServices,
  type TemplateReferenceValues,
} from "@/lib/templates";
import {
  assertDemoDeployRateLimit,
  assertDemoProjectCreateAllowed,
  assertDemoServiceCreateAllowed,
} from "./demo-guards";
import { os } from "./orpc";

function buildManagedDatabaseReferenceValues(input: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}): Record<string, string> {
  return {
    HOST: input.host,
    PORT: String(input.port),
    USERNAME: input.username,
    PASSWORD: input.password,
    DATABASE: input.database,
    DATABASE_URL: buildPostgresConnectionString({
      username: input.username,
      password: input.password,
      host: input.host,
      port: input.port,
      database: input.database,
      ssl: true,
    }),
    POSTGRES_USER: input.username,
    POSTGRES_PASSWORD: input.password,
    POSTGRES_DB: input.database,
  };
}

export const projects = {
  list: os.projects.list.handler(async () => {
    const [projectRows, domain] = await Promise.all([
      db.selectFrom("projects").selectAll().execute(),
      getSetting("domain"),
    ]);

    return Promise.all(
      projectRows.map(async (project) => {
        const [productionEnv, databases] = await Promise.all([
          db
            .selectFrom("environments")
            .select("id")
            .where("projectId", "=", project.id)
            .where("type", "=", "production")
            .executeTakeFirst(),
          listDatabasesWithRuntimeByProject(project.id),
        ]);

        const services = productionEnv
          ? await db
              .selectFrom("services")
              .selectAll()
              .where("environmentId", "=", productionEnv.id)
              .execute()
          : [];

        const servicesWithDeployments =
          await addLatestDeploymentsWithRuntimeStatus(services);
        const resourceSummary = getProjectResourceSummary({
          services: servicesWithDeployments,
          databases,
        });

        let latestDeployment: {
          status: string;
          commitMessage: string | null;
          createdAt: number;
          branch: string | null;
        } | null = null;
        let runningHostPort: number | null = null;

        for (const service of servicesWithDeployments) {
          const deployment = service.latestDeployment;

          if (deployment?.status === "running" && deployment.hostPort) {
            runningHostPort = deployment.hostPort;
          }

          if (
            deployment &&
            (!latestDeployment ||
              deployment.createdAt > latestDeployment.createdAt)
          ) {
            latestDeployment = {
              status: deployment.status,
              commitMessage: deployment.commitMessage,
              createdAt: deployment.createdAt,
              branch: service.branch,
            };
          }
        }

        const repoUrl = services[0]?.repoUrl ?? null;

        let runningUrl: string | null = null;
        if (runningHostPort) {
          runningUrl = domain
            ? `${domain}:${runningHostPort}`
            : `localhost:${runningHostPort}`;
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
          resourceSummary,
          services: servicesWithDeployments.map((service) => ({
            id: service.id,
            name: service.name,
            icon: service.icon,
            imageUrl: service.imageUrl,
            deployType: service.deployType,
            runtimeStatus: service.runtimeStatus,
            attentionStatus: service.attentionStatus,
          })),
        };
      }),
    );
  }),

  get: os.projects.get.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.projectId)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const productionEnv = await db
      .selectFrom("environments")
      .select("id")
      .where("projectId", "=", input.projectId)
      .where("type", "=", "production")
      .executeTakeFirst();

    const services = productionEnv
      ? await db
          .selectFrom("services")
          .selectAll()
          .where("environmentId", "=", productionEnv.id)
          .execute()
      : [];

    const servicesWithDeployments =
      await addLatestDeploymentsWithRuntimeStatus(services);

    return { ...project, services: servicesWithDeployments };
  }),

  create: os.projects.create.handler(async ({ input }) => {
    await assertDemoProjectCreateAllowed();

    let template: ReturnType<typeof getTemplate> | null = null;
    let managedTemplateDatabases: ReturnType<
      typeof getManagedTemplateDatabases
    > = [];

    if (input.templateId) {
      template = getTemplate(input.templateId);
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

      managedTemplateDatabases = getManagedTemplateDatabases(template);
    }

    const id = newProjectId();
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

    const envId = newEnvironmentId();
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

    if (template) {
      try {
        const excludedServices = managedTemplateDatabases.map(
          function getName(database) {
            return database.name;
          },
        );
        const templateReferenceValues: TemplateReferenceValues = {};

        for (const databaseTemplate of managedTemplateDatabases) {
          const createdDatabase = await createDatabase({
            projectId: id,
            name: databaseTemplate.name,
            engine: databaseTemplate.engine,
            image: databaseTemplate.image,
          });
          const connection = await getDatabaseTargetConnectionInfo({
            databaseId: createdDatabase.database.id,
            targetId: createdDatabase.target.id,
          });

          templateReferenceValues[databaseTemplate.name] =
            buildManagedDatabaseReferenceValues({
              host: connection.internalHost,
              port: 5432,
              username: connection.username,
              password: connection.password,
              database: connection.database,
            });
        }

        const resolvedTemplateServices = resolveTemplateServices(template, {
          excludeServices: excludedServices,
          referenceValues: templateReferenceValues,
        });

        await assertDemoServiceCreateAllowed(
          envId,
          resolvedTemplateServices.length,
        );

        for (const svc of resolvedTemplateServices) {
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
            wildcardDomain: { projectHostname: hostname },
          });

          deployService(service.id).catch((err) => {
            console.error(`Auto-deploy failed for service ${service.id}:`, err);
          });
        }
      } catch (error) {
        await cleanupProject(id);
        throw error;
      }
    }

    return project;
  }),

  update: os.projects.update.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.projectId)
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

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("projects")
        .set(updates)
        .where("id", "=", input.projectId)
        .execute();
    }

    const updated = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", input.projectId)
      .executeTakeFirst();

    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    return updated;
  }),

  delete: os.projects.delete.handler(async ({ input }) => {
    await cleanupProject(input.projectId);
    return { success: true };
  }),

  deploy: os.projects.deploy.handler(async ({ input }) => {
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", input.projectId)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const services = await db
      .selectFrom("services")
      .innerJoin("environments", "environments.id", "services.environmentId")
      .select("services.id")
      .where("environments.projectId", "=", input.projectId)
      .execute();
    for (const service of services) {
      await assertDemoDeployRateLimit(service.id);
    }

    const deploymentIds = await deployProject(input.projectId);
    return { deploymentIds };
  }),
};
