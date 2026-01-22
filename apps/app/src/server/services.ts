import { ORPCError } from "@orpc/server";
import { nanoid } from "nanoid";
import { addLatestDeployment, addLatestDeployments, db } from "@/lib/db";
import { deployService } from "@/lib/deployer";
import { stopContainer } from "@/lib/docker";
import { createWildcardDomain, syncCaddyConfig } from "@/lib/domains";
import { slugify } from "@/lib/slugify";
import { generateSelfSignedCert, removeSSLCerts } from "@/lib/ssl";
import { getTemplate, resolveTemplateServices } from "@/lib/templates";
import { buildVolumeName, getVolumeSize, removeVolume } from "@/lib/volumes";
import { os } from "./orpc";

export const services = {
  get: os.services.get.handler(async ({ input }) => {
    const service = await db
      .selectFrom("services")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!service) {
      throw new ORPCError("NOT_FOUND", { message: "Service not found" });
    }

    return addLatestDeployment(service);
  }),

  list: os.services.list.handler(async ({ input }) => {
    const services = await db
      .selectFrom("services")
      .selectAll()
      .where("environmentId", "=", input.environmentId)
      .execute();

    return addLatestDeployments(services);
  }),

  create: os.services.create.handler(async ({ input }) => {
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

    const environment = await db
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", input.environmentId)
      .executeTakeFirst();

    if (!environment) {
      throw new ORPCError("NOT_FOUND", { message: "Environment not found" });
    }

    const project = await db
      .selectFrom("projects")
      .select(["id", "name", "hostname"])
      .where("id", "=", environment.projectId)
      .executeTakeFirst();

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const existing = await db
      .selectFrom("services")
      .select("id")
      .where("environmentId", "=", input.environmentId)
      .where("name", "=", input.name)
      .executeTakeFirst();

    if (existing) {
      throw new ORPCError("CONFLICT", {
        message: "Service with this name already exists in environment",
      });
    }

    const id = nanoid();
    const now = Date.now();
    const hostname = slugify(input.name);

    if (input.deployType === "database") {
      const template = getTemplate(input.templateId!)!;
      const resolved = resolveTemplateServices(template);
      const serviceConfig = resolved[0];

      await db
        .insertInto("services")
        .values({
          id,
          environmentId: input.environmentId,
          name: input.name,
          hostname,
          deployType: "image",
          repoUrl: null,
          branch: null,
          dockerfilePath: null,
          imageUrl: serviceConfig.image,
          envVars: JSON.stringify(serviceConfig.envVars),
          containerPort: serviceConfig.port,
          healthCheckPath: serviceConfig.healthCheckPath ?? null,
          healthCheckTimeout: serviceConfig.healthCheckTimeout,
          autoDeploy: false,
          serviceType: "database",
          volumes: JSON.stringify(serviceConfig.volumes),
          command: serviceConfig.command ?? null,
          createdAt: now,
        })
        .execute();

      if (serviceConfig.ssl) {
        await generateSelfSignedCert(id);
      }
    } else {
      await db
        .insertInto("services")
        .values({
          id,
          environmentId: input.environmentId,
          name: input.name,
          hostname,
          deployType: input.deployType,
          repoUrl: input.deployType === "repo" ? input.repoUrl! : null,
          branch: input.deployType === "repo" ? input.branch : null,
          dockerfilePath:
            input.deployType === "repo" ? input.dockerfilePath : null,
          buildContext:
            input.deployType === "repo" ? (input.buildContext ?? null) : null,
          imageUrl: input.deployType === "image" ? input.imageUrl! : null,
          envVars: JSON.stringify(input.envVars),
          containerPort: input.containerPort ?? null,
          healthCheckPath: input.healthCheckPath ?? null,
          healthCheckTimeout: input.healthCheckTimeout ?? null,
          autoDeploy: input.deployType === "repo",
          memoryLimit: input.memoryLimit ?? null,
          cpuLimit: input.cpuLimit ?? null,
          shutdownTimeout: input.shutdownTimeout ?? null,
          registryId:
            input.deployType === "image" ? (input.registryId ?? null) : null,
          createdAt: now,
        })
        .execute();
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

    if (input.deployType !== "database") {
      const envName =
        environment.type !== "production"
          ? slugify(environment.name)
          : undefined;
      await createWildcardDomain(
        id,
        input.environmentId,
        hostname,
        project.hostname ?? slugify(project.name),
        envName,
      );
    }

    deployService(id).catch((err) => {
      console.error(`Auto-deploy failed for service ${id}:`, err);
    });

    return service;
  }),

  update: os.services.update.handler(async ({ input }) => {
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
      if (input.buildContext !== undefined)
        updates.buildContext = input.buildContext;
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
      updates.autoDeploy = input.autoDeployEnabled;
    if (input.memoryLimit !== undefined)
      updates.memoryLimit = input.memoryLimit;
    if (input.cpuLimit !== undefined) updates.cpuLimit = input.cpuLimit;
    if (input.shutdownTimeout !== undefined)
      updates.shutdownTimeout = input.shutdownTimeout;
    if (input.requestTimeout !== undefined)
      updates.requestTimeout = input.requestTimeout;
    if (input.volumes !== undefined)
      updates.volumes = JSON.stringify(input.volumes);
    if (input.registryId !== undefined) updates.registryId = input.registryId;
    if (input.command !== undefined) updates.command = input.command;

    if (Object.keys(updates).length > 0) {
      await db
        .updateTable("services")
        .set(updates)
        .where("id", "=", input.id)
        .execute();
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

  delete: os.services.delete.handler(async ({ input }) => {
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

    if (service?.volumes && service.volumes !== "[]") {
      const volumeConfig = JSON.parse(service.volumes) as {
        name: string;
        path: string;
      }[];
      for (const v of volumeConfig) {
        await removeVolume(buildVolumeName(input.id, v.name));
      }
    }
    if (service?.serviceType === "database") {
      await removeSSLCerts(input.id);
    }

    await db.deleteFrom("services").where("id", "=", input.id).execute();

    try {
      await syncCaddyConfig();
    } catch {}

    return { success: true };
  }),

  deploy: os.services.deploy.handler(async ({ input }) => {
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

  listDeployments: os.services.listDeployments.handler(async ({ input }) =>
    db
      .selectFrom("deployments")
      .selectAll()
      .where("serviceId", "=", input.id)
      .orderBy("createdAt", "desc")
      .limit(20)
      .execute(),
  ),

  getVolumes: os.services.getVolumes.handler(async ({ input }) => {
    const service = await db
      .selectFrom("services")
      .select("volumes")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!service) {
      throw new ORPCError("NOT_FOUND", { message: "Service not found" });
    }

    if (!service.volumes || service.volumes === "[]") {
      return [];
    }

    const volumeConfig = JSON.parse(service.volumes) as {
      name: string;
      path: string;
    }[];

    return Promise.all(
      volumeConfig.map(async (v) => {
        const dockerVolumeName = buildVolumeName(input.id, v.name);
        const sizeBytes = await getVolumeSize(dockerVolumeName);
        return { name: v.name, path: v.path, sizeBytes };
      }),
    );
  }),
};
