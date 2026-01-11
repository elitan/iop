import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import { deploymentSchema, serviceSchema } from "@/lib/db-schemas";
import { generateCredential, getTemplate } from "@/lib/db-templates";
import { deployService } from "@/lib/deployer";
import { stopContainer } from "@/lib/docker";
import {
  createSystemDomain,
  syncCaddyConfig,
  updateSystemDomain,
} from "@/lib/domains";
import { os } from "@/lib/orpc";
import { generateSelfSignedCert, removeSSLCerts } from "@/lib/ssl";
import { buildVolumeName, removeVolume } from "@/lib/volumes";

const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const idParamSchema = z.object({ id: z.string() });

const serviceWithDeploymentSchema = serviceSchema.extend({
  latestDeployment: deploymentSchema.nullable(),
});

export const services = {
  get: os
    .route({ method: "GET", path: "/services/{id}" })
    .input(z.object({ id: z.string() }))
    .output(serviceWithDeploymentSchema)
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      const latestDeployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("serviceId", "=", input.id)
        .orderBy("createdAt", "desc")
        .limit(1)
        .executeTakeFirst();

      return { ...service, latestDeployment: latestDeployment ?? null };
    }),

  listByProject: os
    .route({ method: "GET", path: "/projects/{projectId}/services" })
    .input(z.object({ projectId: z.string() }))
    .output(z.array(serviceWithDeploymentSchema))
    .handler(async ({ input }) => {
      const services = await db
        .selectFrom("services")
        .selectAll()
        .where("projectId", "=", input.projectId)
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

      return servicesWithDeployments;
    }),

  create: os
    .route({ method: "POST", path: "/projects/{projectId}/services" })
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        deployType: z.enum(["repo", "image", "database"]).default("repo"),
        repoUrl: z.string().optional(),
        branch: z.string().default("main"),
        dockerfilePath: z.string().default("Dockerfile"),
        imageUrl: z.string().optional(),
        envVars: z.array(envVarSchema).default([]),
        containerPort: z.number().min(1).max(65535).optional(),
        templateId: z.string().optional(),
        healthCheckPath: z.string().optional(),
        healthCheckTimeout: z.number().optional(),
      }),
    )
    .output(serviceSchema)
    .handler(async ({ input }) => {
      if (input.deployType === "repo" && !input.repoUrl) {
        throw new ORPCError("BAD_REQUEST", {
          message: "repoUrl is required for repo deployments",
        });
      }
      if (input.deployType === "image" && !input.imageUrl) {
        throw new ORPCError("BAD_REQUEST", {
          message: "imageUrl is required for image deployments",
        });
      }
      if (input.deployType === "database" && !input.templateId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "templateId is required for database deployments",
        });
      }
      if (input.deployType === "database") {
        const template = getTemplate(input.templateId!);
        if (!template) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Unknown database template",
          });
        }
      }

      const project = await db
        .selectFrom("projects")
        .select(["id", "name"])
        .where("id", "=", input.projectId)
        .executeTakeFirst();

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      const existing = await db
        .selectFrom("services")
        .select("id")
        .where("projectId", "=", input.projectId)
        .where("name", "=", input.name)
        .executeTakeFirst();

      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Service with this name already exists in project",
        });
      }

      const id = nanoid();
      const now = Date.now();

      if (input.deployType === "database") {
        const template = getTemplate(input.templateId!)!;
        const dbEnvVars = template.envVars.map((e) => ({
          key: e.key,
          value: e.generated ? generateCredential() : e.value,
        }));

        await db
          .insertInto("services")
          .values({
            id,
            projectId: input.projectId,
            name: input.name,
            deployType: "image",
            repoUrl: null,
            branch: null,
            dockerfilePath: null,
            imageUrl: template.image,
            envVars: JSON.stringify(dbEnvVars),
            containerPort: template.containerPort,
            healthCheckTimeout: template.healthCheckTimeout,
            autoDeploy: 0,
            serviceType: "database",
            volumes: JSON.stringify(template.volumes),
            createdAt: now,
          })
          .execute();

        if (template.supportsSSL) {
          await generateSelfSignedCert(id);
        }
      } else {
        await db
          .insertInto("services")
          .values({
            id,
            projectId: input.projectId,
            name: input.name,
            deployType: input.deployType,
            repoUrl: input.deployType === "repo" ? input.repoUrl! : null,
            branch: input.deployType === "repo" ? input.branch : null,
            dockerfilePath:
              input.deployType === "repo" ? input.dockerfilePath : null,
            imageUrl: input.deployType === "image" ? input.imageUrl! : null,
            envVars: JSON.stringify(input.envVars),
            containerPort: input.containerPort ?? null,
            healthCheckPath: input.healthCheckPath ?? null,
            healthCheckTimeout: input.healthCheckTimeout ?? null,
            autoDeploy: input.deployType === "repo" ? 1 : 0,
            createdAt: now,
          })
          .execute();
      }

      if (input.deployType !== "database") {
        await createSystemDomain(id, input.name, project.name);
      }

      const service = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to create service",
        });
      }

      deployService(id).catch((err) => {
        console.error(`Auto-deploy failed for service ${id}:`, err);
      });

      return service;
    }),

  update: os
    .route({ method: "PATCH", path: "/services/{id}" })
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        envVars: z.array(envVarSchema).optional(),
        containerPort: z.number().min(1).max(65535).optional(),
        branch: z.string().optional(),
        dockerfilePath: z.string().optional(),
        repoUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        healthCheckPath: z.string().nullable().optional(),
        healthCheckTimeout: z.number().min(1).max(300).optional(),
        autoDeployEnabled: z.boolean().optional(),
      }),
    )
    .output(serviceSchema)
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.envVars !== undefined)
        updates.envVars = JSON.stringify(input.envVars);
      if (input.containerPort !== undefined)
        updates.containerPort = input.containerPort;
      if (service.deployType === "repo") {
        if (input.branch !== undefined) updates.branch = input.branch;
        if (input.dockerfilePath !== undefined)
          updates.dockerfilePath = input.dockerfilePath;
        if (input.repoUrl !== undefined) updates.repoUrl = input.repoUrl;
      }
      if (service.deployType === "image" && input.imageUrl !== undefined) {
        updates.imageUrl = input.imageUrl;
      }
      if (input.healthCheckPath !== undefined)
        updates.healthCheckPath = input.healthCheckPath;
      if (input.healthCheckTimeout !== undefined)
        updates.healthCheckTimeout = input.healthCheckTimeout;
      if (input.autoDeployEnabled !== undefined)
        updates.autoDeploy = input.autoDeployEnabled ? 1 : 0;

      if (Object.keys(updates).length > 0) {
        await db
          .updateTable("services")
          .set(updates)
          .where("id", "=", input.id)
          .execute();
      }

      if (input.name !== undefined && input.name !== service.name) {
        const project = await db
          .selectFrom("projects")
          .select("name")
          .where("id", "=", service.projectId)
          .executeTakeFirst();
        if (project) {
          await updateSystemDomain(input.id, input.name, project.name);
        }
      }

      const updated = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      return updated;
    }),

  delete: os
    .route({ method: "DELETE", path: "/services/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .select(["serviceType", "volumes"])
        .where("id", "=", input.id)
        .executeTakeFirst();

      const deployments = await db
        .selectFrom("deployments")
        .select("containerId")
        .where("serviceId", "=", input.id)
        .execute();

      for (const deployment of deployments) {
        if (deployment.containerId) {
          await stopContainer(deployment.containerId);
        }
      }

      if (service?.serviceType === "database" && service.volumes) {
        const volumeConfig = JSON.parse(service.volumes) as {
          name: string;
          path: string;
        }[];
        for (const v of volumeConfig) {
          await removeVolume(buildVolumeName(input.id, v.name));
        }
        await removeSSLCerts(input.id);
      }

      await db.deleteFrom("services").where("id", "=", input.id).execute();

      try {
        await syncCaddyConfig();
      } catch {}

      return { success: true };
    }),

  deploy: os
    .route({ method: "POST", path: "/services/{id}/deploy" })
    .input(idParamSchema)
    .output(z.object({ deploymentId: z.string() }))
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .select("id")
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      const deploymentId = await deployService(input.id);
      return { deploymentId };
    }),

  listDeployments: os
    .route({ method: "GET", path: "/services/{id}/deployments" })
    .input(idParamSchema)
    .output(z.array(deploymentSchema))
    .handler(async ({ input }) => {
      const deployments = await db
        .selectFrom("deployments")
        .selectAll()
        .where("serviceId", "=", input.id)
        .orderBy("createdAt", "desc")
        .limit(20)
        .execute();
      return deployments;
    }),
};
