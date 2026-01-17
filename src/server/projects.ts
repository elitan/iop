import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSetting } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deploymentsSchema,
  projectsSchema,
  servicesSchema,
} from "@/lib/db-schemas";
import { deployProject, deployService } from "@/lib/deployer";
import { removeNetwork, stopContainer } from "@/lib/docker";
import { os } from "@/lib/orpc";
import { slugify } from "@/lib/slugify";
import { generateSelfSignedCert } from "@/lib/ssl";
import { getTemplate, resolveTemplateServices } from "@/lib/templates";

const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const latestDeploymentSchema = z.object({
  status: z.string(),
  commitMessage: z.string().nullable(),
  createdAt: z.number(),
  branch: z.string().nullable(),
});

const projectListItemSchema = projectsSchema.extend({
  servicesCount: z.number(),
  latestDeployment: latestDeploymentSchema.nullable(),
  repoUrl: z.string().nullable(),
  runningUrl: z.string().nullable(),
});

const serviceWithDeploymentSchema = servicesSchema.extend({
  latestDeployment: deploymentsSchema.nullable(),
});

const projectWithServicesSchema = projectsSchema.extend({
  services: z.array(serviceWithDeploymentSchema),
});

export const projects = {
  list: os
    .route({ method: "GET", path: "/projects" })
    .output(z.array(projectListItemSchema))
    .handler(async () => {
      const [projectRows, domain] = await Promise.all([
        db.selectFrom("projects").selectAll().execute(),
        getSetting("domain"),
      ]);

      const projectsWithDetails = await Promise.all(
        projectRows.map(async (project) => {
          const services = await db
            .selectFrom("services")
            .selectAll()
            .where("projectId", "=", project.id)
            .execute();

          const latestDeployment = await db
            .selectFrom("deployments")
            .innerJoin("services", "services.id", "deployments.serviceId")
            .select([
              "deployments.status",
              "deployments.commitMessage",
              "deployments.createdAt",
              "services.branch",
            ])
            .where("deployments.projectId", "=", project.id)
            .orderBy("deployments.createdAt", "desc")
            .executeTakeFirst();

          const runningDeployment = await db
            .selectFrom("deployments")
            .select(["hostPort"])
            .where("projectId", "=", project.id)
            .where("status", "=", "running")
            .where("hostPort", "is not", null)
            .executeTakeFirst();

          const firstService = services[0];
          const repoUrl = firstService?.repoUrl ?? null;

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
          };
        }),
      );

      return projectsWithDetails;
    }),

  get: os
    .route({ method: "GET", path: "/projects/{id}" })
    .input(z.object({ id: z.string() }))
    .output(projectWithServicesSchema)
    .handler(async ({ input }) => {
      const project = await db
        .selectFrom("projects")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      const services = await db
        .selectFrom("services")
        .selectAll()
        .where("projectId", "=", input.id)
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

      return { ...project, services: servicesWithDeployments };
    }),

  create: os
    .route({ method: "POST", path: "/projects" })
    .input(
      z.object({
        name: z.string().min(1),
        envVars: z.array(envVarSchema).default([]),
        templateId: z.string().optional(),
      }),
    )
    .output(projectsSchema)
    .handler(async ({ input }) => {
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
          const serviceId = nanoid();
          const serviceHostname = slugify(svc.name);

          await db
            .insertInto("services")
            .values({
              id: serviceId,
              projectId: id,
              name: svc.name,
              hostname: serviceHostname,
              deployType: "image",
              repoUrl: null,
              branch: null,
              dockerfilePath: null,
              imageUrl: svc.image,
              envVars: JSON.stringify(svc.envVars),
              containerPort: svc.port,
              healthCheckPath: svc.healthCheckPath ?? null,
              healthCheckTimeout: svc.healthCheckTimeout,
              autoDeploy: 0,
              serviceType: svc.isDatabase ? "database" : "app",
              volumes: JSON.stringify(svc.volumes),
              command: svc.command ?? null,
              createdAt: now,
            })
            .execute();

          if (svc.ssl) {
            await generateSelfSignedCert(serviceId);
          }

          deployService(serviceId).catch((err) => {
            console.error(`Auto-deploy failed for service ${serviceId}:`, err);
          });
        }
      }

      return project;
    }),

  update: os
    .route({ method: "PATCH", path: "/projects/{id}" })
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        envVars: z.array(envVarSchema).optional(),
      }),
    )
    .output(projectsSchema)
    .handler(async ({ input }) => {
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

  delete: os
    .route({ method: "DELETE", path: "/projects/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      const deployments = await db
        .selectFrom("deployments")
        .select(["id", "containerId"])
        .where("projectId", "=", input.id)
        .execute();

      for (const deployment of deployments) {
        if (deployment.containerId) {
          await stopContainer(deployment.containerId);
        }
      }

      await removeNetwork(`frost-net-${input.id}`.toLowerCase());
      await db.deleteFrom("projects").where("id", "=", input.id).execute();

      return { success: true };
    }),

  deploy: os
    .route({ method: "POST", path: "/projects/{id}/deploy" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentIds: z.array(z.string()) }))
    .handler(async ({ input }) => {
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
