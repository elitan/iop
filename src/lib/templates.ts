import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { nanoid } from "nanoid";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const generatedValueSchema = z.object({
  generated: z.enum(["password", "base64_32", "base64_64"]),
});

const envValueSchema = z.union([z.string(), generatedValueSchema]);

const healthCheckSchema = z.object({
  path: z.string().optional(),
  timeout: z.number().default(60),
});

const serviceDefinitionSchema = z.object({
  image: z.string(),
  port: z.number(),
  main: z.boolean().optional(),
  type: z.enum(["database", "app"]).optional(),
  command: z.string().optional(),
  environment: z.record(z.string(), envValueSchema).optional(),
  volumes: z.array(z.string()).optional(),
  health_check: healthCheckSchema.optional(),
  ssl: z.boolean().optional(),
});

const templateFileSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string(),
  docs: z.string().optional(),
  services: z.record(z.string(), serviceDefinitionSchema),
});

export type GeneratedValue = z.infer<typeof generatedValueSchema>;
export type EnvValue = z.infer<typeof envValueSchema>;
export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;
export type TemplateFile = z.infer<typeof templateFileSchema>;

export type TemplateType = "database" | "service" | "project";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  docs?: string;
  type: TemplateType;
  services: Record<string, ServiceDefinition>;
}

export interface VolumeMount {
  name: string;
  path: string;
}

export interface ResolvedEnvVar {
  key: string;
  value: string;
  generated?: boolean;
}

export interface ResolvedService {
  name: string;
  image: string;
  port: number;
  isMain: boolean;
  isDatabase: boolean;
  command?: string;
  envVars: ResolvedEnvVar[];
  volumes: VolumeMount[];
  healthCheckPath?: string;
  healthCheckTimeout: number;
  ssl: boolean;
}

function parseVolumeString(vol: string): VolumeMount {
  const parts = vol.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid volume format: ${vol}`);
  }
  return { name: parts[0], path: parts[1] };
}

function loadTemplatesFromDir(dirPath: string, type: TemplateType): Template[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const templates: Template[] = [];
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".yaml"));

  for (const file of files) {
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content);
    const validated = templateFileSchema.parse(parsed);
    const id = basename(file, ".yaml");

    templates.push({
      id,
      name: validated.name,
      description: validated.description,
      category: validated.category,
      docs: validated.docs,
      type,
      services: validated.services,
    });
  }

  return templates;
}

function getTemplatesDir(): string {
  const devPath = join(process.cwd(), "templates");
  if (existsSync(devPath)) {
    return devPath;
  }
  return join(process.cwd(), "templates");
}

let cachedTemplates: Template[] | null = null;

function loadAllTemplates(): Template[] {
  if (cachedTemplates) {
    return cachedTemplates;
  }

  const templatesDir = getTemplatesDir();
  const databases = loadTemplatesFromDir(
    join(templatesDir, "databases"),
    "database",
  );
  const services = loadTemplatesFromDir(
    join(templatesDir, "services"),
    "service",
  );
  const projects = loadTemplatesFromDir(
    join(templatesDir, "projects"),
    "project",
  );

  cachedTemplates = [...databases, ...services, ...projects];
  return cachedTemplates;
}

export function getTemplates(): Template[] {
  return loadAllTemplates();
}

export function getTemplate(id: string): Template | undefined {
  return loadAllTemplates().find((t) => t.id === id);
}

export function getServiceTemplates(): Template[] {
  return loadAllTemplates().filter(
    (t) => t.type === "database" || t.type === "service",
  );
}

export function getProjectTemplates(): Template[] {
  return loadAllTemplates().filter((t) => t.type === "project");
}

export function getDatabaseTemplates(): Template[] {
  return loadAllTemplates().filter((t) => t.type === "database");
}

export function generateCredential(
  type: "password" | "base64_32" | "base64_64" = "password",
): string {
  switch (type) {
    case "password":
      return nanoid(32);
    case "base64_32":
      return Buffer.from(
        Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
      ).toString("base64");
    case "base64_64":
      return Buffer.from(
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 256)),
      ).toString("base64");
    default:
      return nanoid(32);
  }
}

export function isGeneratedValue(value: EnvValue): value is GeneratedValue {
  return typeof value === "object" && "generated" in value;
}

export function resolveTemplateServices(template: Template): ResolvedService[] {
  const generatedValues: Record<string, Record<string, string>> = {};

  for (const [serviceName, service] of Object.entries(template.services)) {
    generatedValues[serviceName] = {};
    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          generatedValues[serviceName][key] = generateCredential(
            value.generated,
          );
        }
      }
    }
  }

  const resolved: ResolvedService[] = [];

  for (const [serviceName, service] of Object.entries(template.services)) {
    const envVars: ResolvedEnvVar[] = [];

    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          envVars.push({
            key,
            value: generatedValues[serviceName][key],
            generated: true,
          });
        } else {
          let resolvedValue = value;
          const refPattern = /\$\{([^.]+)\.([^}]+)\}/g;
          const matches = value.matchAll(refPattern);
          for (const match of matches) {
            const [fullMatch, refService, refKey] = match;
            const refValue = generatedValues[refService]?.[refKey];
            if (refValue) {
              resolvedValue = resolvedValue.replace(fullMatch, refValue);
            }
          }
          envVars.push({ key, value: resolvedValue });
        }
      }
    }

    const volumes: VolumeMount[] = [];
    if (service.volumes) {
      for (const vol of service.volumes) {
        volumes.push(parseVolumeString(vol));
      }
    }

    resolved.push({
      name: serviceName,
      image: service.image,
      port: service.port,
      isMain: service.main ?? false,
      isDatabase: service.type === "database",
      command: service.command,
      envVars,
      volumes,
      healthCheckPath: service.health_check?.path,
      healthCheckTimeout: service.health_check?.timeout ?? 60,
      ssl: service.ssl ?? false,
    });
  }

  const mainService = resolved.find((s) => s.isMain);
  if (!mainService && resolved.length > 0) {
    resolved[0].isMain = true;
  }

  return resolved;
}

export function clearTemplateCache(): void {
  cachedTemplates = null;
}

export { buildConnectionString } from "./connection-strings";
