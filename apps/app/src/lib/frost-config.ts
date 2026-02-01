import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Selectable } from "kysely";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Services } from "./db-types";

export const frostConfigSchema = z
  .object({
    dockerfile: z.string().optional(),
    port: z.number().min(1).max(65535).optional(),
    health_check: z
      .object({
        path: z.string().optional(),
        timeout: z.number().min(1).max(300).optional(),
      })
      .optional(),
    resources: z
      .object({
        memory: z
          .string()
          .regex(/^\d+[kmg]$/i)
          .optional(),
        cpu: z.number().min(0.1).max(64).optional(),
      })
      .optional(),
    deploy: z
      .object({
        drain_timeout: z.number().min(0).max(300).optional(),
        shutdown_timeout: z.number().min(1).max(300).optional(),
        replicas: z.number().min(1).max(10).optional(),
      })
      .optional(),
  })
  .strict();

export type FrostConfig = z.infer<typeof frostConfigSchema>;

export function parseFrostConfig(content: string): FrostConfig {
  const parsed = parseYaml(content);
  return frostConfigSchema.parse(parsed);
}

export type FrostConfigResult =
  | {
      found: false;
      error?: undefined;
      config?: undefined;
      filename?: undefined;
    }
  | { found: true; error: string; config?: undefined; filename?: undefined }
  | { found: true; error?: undefined; config: FrostConfig; filename: string };

export function loadFrostConfig(
  repoPath: string,
  frostFilePath: string,
): FrostConfigResult {
  const basePath = frostFilePath.replace(/\.(yaml|yml)$/, "");
  const yamlPath = join(repoPath, `${basePath}.yaml`);
  const ymlPath = join(repoPath, `${basePath}.yml`);

  const yamlExists = existsSync(yamlPath);
  const ymlExists = existsSync(ymlPath);

  if (yamlExists && ymlExists) {
    return {
      found: true,
      error: `Both ${basePath}.yaml and ${basePath}.yml exist. Remove one.`,
    };
  }

  if (!yamlExists && !ymlExists) {
    return { found: false };
  }

  const filePath = yamlExists ? yamlPath : ymlPath;
  const filename = yamlExists ? `${basePath}.yaml` : `${basePath}.yml`;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: any) {
    return { found: true, error: `Failed to read config: ${err.message}` };
  }

  if (!content.trim()) {
    return { found: false };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err: any) {
    return { found: true, error: `Invalid YAML: ${err.message}` };
  }

  if (parsed === null || parsed === undefined) {
    return { found: false };
  }

  const result = frostConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { found: true, error: issues };
  }

  return { found: true, config: result.data, filename };
}

type EffectiveService = Pick<
  Selectable<Services>,
  | "dockerfilePath"
  | "containerPort"
  | "healthCheckPath"
  | "healthCheckTimeout"
  | "memoryLimit"
  | "cpuLimit"
  | "drainTimeout"
  | "shutdownTimeout"
  | "replicaCount"
>;

export function mergeConfigWithService<T extends EffectiveService>(
  service: T,
  config: FrostConfig,
): T {
  return {
    ...service,
    dockerfilePath: config.dockerfile ?? service.dockerfilePath,
    containerPort: config.port ?? service.containerPort,
    healthCheckPath: config.health_check?.path ?? service.healthCheckPath,
    healthCheckTimeout:
      config.health_check?.timeout ?? service.healthCheckTimeout,
    memoryLimit: config.resources?.memory ?? service.memoryLimit,
    cpuLimit: config.resources?.cpu ?? service.cpuLimit,
    drainTimeout: config.deploy?.drain_timeout ?? service.drainTimeout,
    shutdownTimeout: config.deploy?.shutdown_timeout ?? service.shutdownTimeout,
    replicaCount: config.deploy?.replicas ?? service.replicaCount,
  };
}
