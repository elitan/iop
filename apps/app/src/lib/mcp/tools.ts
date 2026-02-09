import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  deployProject,
  deployService,
  rollbackDeployment,
} from "@/lib/deployer";
import {
  addDomain,
  getDomain,
  getDomainByName,
  removeDomain,
  syncCaddyConfig,
} from "@/lib/domains";
import { cleanupProject, cleanupService } from "@/lib/lifecycle";
import { createService } from "@/lib/services";
import { shellEscape } from "@/lib/shell-escape";
import { slugify } from "@/lib/slugify";
import type { EnvVar } from "@/lib/types";

const execAsync = promisify(exec);

async function getProductionEnvironmentId(projectId: string): Promise<string> {
  const env = await db
    .selectFrom("environments")
    .select("id")
    .where("projectId", "=", projectId)
    .where("type", "=", "production")
    .executeTakeFirst();

  if (!env) {
    throw new Error(`No production environment found for project ${projectId}`);
  }

  return env.id;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerTools(server: McpServer) {
  server.tool(
    "list_projects",
    "List all projects with service count",
    {},
    async () => {
      const projects = await db.selectFrom("projects").selectAll().execute();

      const results = await Promise.all(
        projects.map(async (p) => {
          const env = await db
            .selectFrom("environments")
            .select("id")
            .where("projectId", "=", p.id)
            .where("type", "=", "production")
            .executeTakeFirst();

          let serviceCount = 0;
          if (env) {
            const row = await db
              .selectFrom("services")
              .select(db.fn.countAll().as("count"))
              .where("environmentId", "=", env.id)
              .executeTakeFirst();
            serviceCount = Number(row?.count ?? 0);
          }

          return { id: p.id, name: p.name, serviceCount };
        }),
      );

      return textResult(results);
    },
  );

  server.tool(
    "get_project",
    "Get project details with all services",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = await db
        .selectFrom("projects")
        .selectAll()
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (!project) return errorResult("Project not found");

      const envId = await getProductionEnvironmentId(projectId);
      const services = await db
        .selectFrom("services")
        .selectAll()
        .where("environmentId", "=", envId)
        .execute();

      return textResult({ ...project, services });
    },
  );

  server.tool(
    "create_project",
    "Create a new empty project",
    { name: z.string() },
    async ({ name }) => {
      const id = nanoid();
      const now = Date.now();

      await db
        .insertInto("projects")
        .values({ id, name, hostname: slugify(name), createdAt: now })
        .execute();

      const envId = nanoid();
      await db
        .insertInto("environments")
        .values({
          id: envId,
          projectId: id,
          name: "production",
          type: "production",
          createdAt: now,
        })
        .execute();

      return textResult({ id, name, environmentId: envId });
    },
  );

  server.tool(
    "delete_project",
    "Delete a project and all its resources",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = await db
        .selectFrom("projects")
        .select("id")
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (!project) return errorResult("Project not found");

      await cleanupProject(projectId);
      return textResult({ deleted: true, projectId });
    },
  );

  server.tool(
    "list_services",
    "List services in a project with latest deployment status",
    { projectId: z.string() },
    async ({ projectId }) => {
      const envId = await getProductionEnvironmentId(projectId);
      const services = await db
        .selectFrom("services")
        .selectAll()
        .where("environmentId", "=", envId)
        .execute();

      const results = await Promise.all(
        services.map(async (s) => {
          const deployment = await db
            .selectFrom("deployments")
            .select(["id", "status", "createdAt"])
            .where("serviceId", "=", s.id)
            .orderBy("createdAt", "desc")
            .limit(1)
            .executeTakeFirst();

          return {
            id: s.id,
            name: s.name,
            deployType: s.deployType,
            imageUrl: s.imageUrl,
            repoUrl: s.repoUrl,
            latestDeployment: deployment ?? null,
          };
        }),
      );

      return textResult(results);
    },
  );

  server.tool(
    "get_service",
    "Get service config and latest deployment",
    { serviceId: z.string() },
    async ({ serviceId }) => {
      const service = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      const deployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("serviceId", "=", serviceId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .executeTakeFirst();

      return textResult({ ...service, latestDeployment: deployment ?? null });
    },
  );

  server.tool(
    "create_service",
    "Create a new service in a project",
    {
      projectId: z.string(),
      name: z.string(),
      deployType: z.enum(["repo", "image"]),
      repoUrl: z.string().optional(),
      branch: z.string().optional(),
      dockerfilePath: z.string().optional(),
      buildContext: z.string().optional(),
      imageUrl: z.string().optional(),
      registryId: z.string().optional(),
      containerPort: z.number().optional(),
      envVars: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .optional(),
      healthCheckPath: z.string().optional(),
      healthCheckTimeout: z.number().optional(),
      memoryLimit: z.string().optional(),
      cpuLimit: z.number().optional(),
      command: z.string().optional(),
      shutdownTimeout: z.number().optional(),
      drainTimeout: z.number().optional(),
      frostFilePath: z.string().optional(),
      autoDeployEnabled: z.boolean().optional(),
      replicaCount: z.number().optional(),
      volumes: z
        .array(z.object({ name: z.string(), path: z.string() }))
        .optional(),
    },
    async ({ projectId, name, deployType, ...opts }) => {
      if (deployType === "repo" && !opts.repoUrl) {
        return errorResult("repoUrl is required for repo deployments");
      }

      if (deployType === "image" && !opts.imageUrl) {
        return errorResult("imageUrl is required for image deployments");
      }

      if ((opts.replicaCount ?? 1) > 1) {
        const volumes = opts.volumes ?? [];
        if (volumes.length > 0) {
          return errorResult("Cannot use replicas with volumes");
        }
      }

      const envId = await getProductionEnvironmentId(projectId);
      const hostname = slugify(name);

      const service = await createService({
        environmentId: envId,
        name,
        hostname,
        deployType,
        repoUrl: deployType === "repo" ? (opts.repoUrl ?? null) : null,
        branch: deployType === "repo" ? (opts.branch ?? null) : null,
        dockerfilePath:
          deployType === "repo" ? (opts.dockerfilePath ?? null) : null,
        buildContext:
          deployType === "repo" ? (opts.buildContext ?? null) : null,
        imageUrl: deployType === "image" ? (opts.imageUrl ?? null) : null,
        registryId: deployType === "image" ? (opts.registryId ?? null) : null,
        envVars: opts.envVars,
        containerPort: opts.containerPort ?? null,
        healthCheckPath: opts.healthCheckPath ?? null,
        healthCheckTimeout: opts.healthCheckTimeout ?? null,
        memoryLimit: opts.memoryLimit ?? null,
        cpuLimit: opts.cpuLimit ?? null,
        shutdownTimeout: opts.shutdownTimeout ?? null,
        drainTimeout: opts.drainTimeout ?? null,
        command: opts.command ?? null,
        autoDeploy: opts.autoDeployEnabled ?? deployType === "repo",
        frostFilePath:
          deployType === "repo" ? (opts.frostFilePath ?? null) : null,
        replicaCount: opts.replicaCount,
        volumes: opts.volumes,
      });

      return textResult(service);
    },
  );

  server.tool(
    "update_service",
    "Update service settings",
    {
      serviceId: z.string(),
      name: z.string().optional(),
      repoUrl: z.string().optional(),
      branch: z.string().optional(),
      dockerfilePath: z.string().optional(),
      buildContext: z.string().optional(),
      imageUrl: z.string().optional(),
      containerPort: z.number().optional(),
      healthCheckPath: z.string().optional(),
      healthCheckTimeout: z.number().optional(),
      memoryLimit: z.string().optional(),
      cpuLimit: z.number().optional(),
      command: z.string().optional(),
      shutdownTimeout: z.number().optional(),
      drainTimeout: z.number().optional(),
      requestTimeout: z.number().optional(),
      replicaCount: z.number().optional(),
      registryId: z.string().optional(),
      frostFilePath: z.string().optional(),
      autoDeployEnabled: z.boolean().optional(),
      volumes: z
        .array(z.object({ name: z.string(), path: z.string() }))
        .optional(),
    },
    async ({ serviceId, volumes, ...input }) => {
      const service = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      let currentVolumes: Array<{ name: string; path: string }> = [];
      try {
        currentVolumes = service.volumes
          ? (JSON.parse(service.volumes) as Array<{
              name: string;
              path: string;
            }>)
          : [];
      } catch {
        currentVolumes = [];
      }

      const nextReplicaCount = input.replicaCount ?? service.replicaCount ?? 1;
      const nextVolumes = volumes ?? currentVolumes;
      if (nextReplicaCount > 1 && nextVolumes.length > 0) {
        return errorResult("Cannot use replicas with volumes");
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.containerPort !== undefined)
        updates.containerPort = input.containerPort;
      if (service.deployType === "repo") {
        if (input.repoUrl !== undefined) updates.repoUrl = input.repoUrl;
        if (input.branch !== undefined) updates.branch = input.branch;
        if (input.dockerfilePath !== undefined)
          updates.dockerfilePath = input.dockerfilePath;
        if (input.buildContext !== undefined)
          updates.buildContext = input.buildContext;
        if (input.frostFilePath !== undefined)
          updates.frostFilePath = input.frostFilePath;
      }
      if (service.deployType === "image" && input.imageUrl !== undefined) {
        updates.imageUrl = input.imageUrl;
      }
      if (input.healthCheckPath !== undefined)
        updates.healthCheckPath = input.healthCheckPath;
      if (input.healthCheckTimeout !== undefined)
        updates.healthCheckTimeout = input.healthCheckTimeout;
      if (input.memoryLimit !== undefined)
        updates.memoryLimit = input.memoryLimit;
      if (input.cpuLimit !== undefined) updates.cpuLimit = input.cpuLimit;
      if (input.command !== undefined) updates.command = input.command;
      if (input.shutdownTimeout !== undefined)
        updates.shutdownTimeout = input.shutdownTimeout;
      if (input.drainTimeout !== undefined)
        updates.drainTimeout = input.drainTimeout;
      if (input.requestTimeout !== undefined)
        updates.requestTimeout = input.requestTimeout;
      if (input.autoDeployEnabled !== undefined)
        updates.autoDeploy = input.autoDeployEnabled;
      if (input.registryId !== undefined) updates.registryId = input.registryId;
      if (volumes !== undefined) updates.volumes = JSON.stringify(volumes);
      if (input.replicaCount !== undefined)
        updates.replicaCount = input.replicaCount;

      if (Object.keys(updates).length > 0) {
        await db
          .updateTable("services")
          .set(updates)
          .where("id", "=", serviceId)
          .execute();
      }

      const updated = await db
        .selectFrom("services")
        .selectAll()
        .where("id", "=", serviceId)
        .executeTakeFirst();

      return textResult(updated);
    },
  );

  server.tool(
    "delete_service",
    "Delete a service",
    { serviceId: z.string() },
    async ({ serviceId }) => {
      const service = await db
        .selectFrom("services")
        .select("id")
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      await cleanupService(serviceId);
      await db.deleteFrom("services").where("id", "=", serviceId).execute();

      try {
        await syncCaddyConfig();
      } catch {}

      return textResult({ deleted: true, serviceId });
    },
  );

  server.tool(
    "deploy_service",
    "Trigger a deployment for a service",
    { serviceId: z.string() },
    async ({ serviceId }) => {
      try {
        const deploymentId = await deployService(serviceId);
        return textResult({ deploymentId, status: "started" });
      } catch (err) {
        return errorResult(
          `Deploy failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  server.tool(
    "deploy_project",
    "Deploy all services in a project",
    { projectId: z.string() },
    async ({ projectId }) => {
      try {
        const deploymentIds = await deployProject(projectId);
        return textResult({ deploymentIds, status: "started" });
      } catch (err) {
        return errorResult(
          `Deploy failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  server.tool(
    "get_deployment",
    "Get deployment status, build log, and error info",
    { deploymentId: z.string() },
    async ({ deploymentId }) => {
      const deployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      if (!deployment) return errorResult("Deployment not found");

      return textResult(deployment);
    },
  );

  server.tool(
    "list_deployments",
    "List recent deployments for a service",
    {
      serviceId: z.string(),
      limit: z.number().optional(),
    },
    async ({ serviceId, limit }) => {
      const deployments = await db
        .selectFrom("deployments")
        .select([
          "id",
          "serviceId",
          "status",
          "createdAt",
          "errorMessage",
          "hostPort",
          "imageName",
          "containerId",
        ])
        .where("serviceId", "=", serviceId)
        .orderBy("createdAt", "desc")
        .limit(limit ?? 10)
        .execute();

      return textResult(deployments);
    },
  );

  server.tool(
    "rollback",
    "Rollback to a previous deployment",
    { deploymentId: z.string() },
    async ({ deploymentId }) => {
      try {
        const newDeploymentId = await rollbackDeployment(deploymentId);
        return textResult({ newDeploymentId, status: "started" });
      } catch (err) {
        return errorResult(
          `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  server.tool(
    "list_env_vars",
    "Get environment variables for a service",
    { serviceId: z.string() },
    async ({ serviceId }) => {
      const service = await db
        .selectFrom("services")
        .select("envVars")
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      const vars: EnvVar[] = JSON.parse(service.envVars);
      return textResult(vars);
    },
  );

  server.tool(
    "set_env_vars",
    "Set/update environment variables for a service (merge, not replace)",
    {
      serviceId: z.string(),
      vars: z.array(z.object({ key: z.string(), value: z.string() })),
    },
    async ({ serviceId, vars }) => {
      const service = await db
        .selectFrom("services")
        .select("envVars")
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      const existing: EnvVar[] = JSON.parse(service.envVars);
      const merged = [...existing];

      for (const newVar of vars) {
        const idx = merged.findIndex((v) => v.key === newVar.key);
        if (idx >= 0) {
          merged[idx] = newVar;
        } else {
          merged.push(newVar);
        }
      }

      await db
        .updateTable("services")
        .set({ envVars: JSON.stringify(merged) })
        .where("id", "=", serviceId)
        .execute();

      return textResult({ envVars: merged, redeployRequired: true });
    },
  );

  server.tool(
    "delete_env_vars",
    "Delete environment variables by key",
    {
      serviceId: z.string(),
      keys: z.array(z.string()),
    },
    async ({ serviceId, keys }) => {
      const service = await db
        .selectFrom("services")
        .select("envVars")
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      const existing: EnvVar[] = JSON.parse(service.envVars);
      const keySet = new Set(keys);
      const filtered = existing.filter((v) => !keySet.has(v.key));

      await db
        .updateTable("services")
        .set({ envVars: JSON.stringify(filtered) })
        .where("id", "=", serviceId)
        .execute();

      return textResult({ envVars: filtered, redeployRequired: true });
    },
  );

  server.tool(
    "list_domains",
    "List domains for a service",
    { serviceId: z.string() },
    async ({ serviceId }) => {
      const domains = await db
        .selectFrom("domains")
        .selectAll()
        .where("serviceId", "=", serviceId)
        .execute();

      return textResult(domains);
    },
  );

  server.tool(
    "add_domain",
    "Add a custom domain to a service",
    { serviceId: z.string(), domain: z.string() },
    async ({ serviceId, domain }) => {
      const service = await db
        .selectFrom("services")
        .select(["id", "environmentId"])
        .where("id", "=", serviceId)
        .executeTakeFirst();

      if (!service) return errorResult("Service not found");

      const existing = await getDomainByName(domain);
      if (existing) return errorResult("Domain already exists");

      const created = await addDomain(serviceId, service.environmentId, {
        domain,
        type: "proxy",
      });

      if (created.dnsVerified) {
        try {
          await syncCaddyConfig();
        } catch {}
      }

      return textResult(created);
    },
  );

  server.tool(
    "remove_domain",
    "Remove a domain",
    { domainId: z.string() },
    async ({ domainId }) => {
      const d = await getDomain(domainId);
      if (!d) return errorResult("Domain not found");

      if (d.isSystem) {
        const others = await db
          .selectFrom("domains")
          .select("id")
          .where("serviceId", "=", d.serviceId)
          .where("id", "!=", domainId)
          .where("dnsVerified", "=", true)
          .execute();
        if (others.length === 0) {
          return errorResult(
            "Cannot delete system domain when no other verified domain exists",
          );
        }
      }

      await removeDomain(domainId);

      if (d.dnsVerified) {
        try {
          await syncCaddyConfig();
        } catch {}
      }

      return textResult({ deleted: true, domainId });
    },
  );

  server.tool(
    "get_build_log",
    "Get build/deploy log for a deployment",
    { deploymentId: z.string() },
    async ({ deploymentId }) => {
      const deployment = await db
        .selectFrom("deployments")
        .select(["id", "buildLog", "errorMessage", "status"])
        .where("id", "=", deploymentId)
        .executeTakeFirst();

      if (!deployment) return errorResult("Deployment not found");

      return textResult({
        status: deployment.status,
        buildLog: deployment.buildLog,
        errorMessage: deployment.errorMessage,
      });
    },
  );

  server.tool(
    "get_runtime_logs",
    "Get recent container logs (non-streaming snapshot)",
    {
      serviceId: z.string(),
      tail: z.number().optional(),
      replica: z.number().optional(),
    },
    async ({ serviceId, tail, replica }) => {
      const deployment = await db
        .selectFrom("deployments")
        .select(["id", "containerId", "status"])
        .where("serviceId", "=", serviceId)
        .where("status", "=", "running")
        .orderBy("createdAt", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!deployment) {
        return errorResult("No running deployment found for this service");
      }

      const tailStr = shellEscape(String(tail ?? 100));

      let replicaQuery = db
        .selectFrom("replicas")
        .select(["containerId", "replicaIndex"])
        .where("deploymentId", "=", deployment.id)
        .where("status", "=", "running")
        .where("containerId", "is not", null)
        .orderBy("replicaIndex", "asc");

      if (replica !== undefined) {
        replicaQuery = replicaQuery.where("replicaIndex", "=", replica);
      }

      const replicas = await replicaQuery.execute();

      try {
        if (replicas.length > 0) {
          const logParts = await Promise.all(
            replicas.map(async (r) => {
              const { stdout, stderr } = await execAsync(
                `docker logs --tail ${tailStr} ${shellEscape(r.containerId!)}`,
                { maxBuffer: 1024 * 1024 },
              );
              const output = stdout + stderr;
              if (replicas.length === 1) return output;
              return output
                .split("\n")
                .filter((l) => l)
                .map((l) => `[replica-${r.replicaIndex}] ${l}`)
                .join("\n");
            }),
          );
          return textResult({ logs: logParts.join("\n") });
        }

        if (!deployment.containerId) {
          return errorResult("No running container found for this service");
        }

        const { stdout, stderr } = await execAsync(
          `docker logs --tail ${tailStr} ${shellEscape(deployment.containerId)}`,
          { maxBuffer: 1024 * 1024 },
        );
        return textResult({ logs: stdout + stderr });
      } catch (err) {
        return errorResult(
          `Failed to get logs: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}
