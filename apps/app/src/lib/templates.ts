import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as jose from "jose";
import { nanoid } from "nanoid";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const generatedValueSchema = z.object({
  generated: z.enum([
    "password",
    "base64_32",
    "base64_64",
    "jwt_secret",
    "jwt_anon",
    "jwt_service_role",
  ]),
});

const envValueSchema = z.union([z.string(), generatedValueSchema]);

const healthCheckSchema = z.object({
  path: z.string().optional(),
  timeout: z.number().default(60),
});

const configFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const serviceDefinitionSchema = z.object({
  image: z.string(),
  port: z.number(),
  icon: z.string().optional(),
  main: z.boolean().optional(),
  type: z.enum(["database", "app"]).optional(),
  command: z.string().optional(),
  environment: z.record(z.string(), envValueSchema).optional(),
  volumes: z.array(z.string()).optional(),
  config_files: z.array(configFileSchema).optional(),
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
export type ConfigFileDefinition = z.infer<typeof configFileSchema>;
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

export interface ConfigFile {
  path: string;
  content: string;
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
  icon?: string;
  isMain: boolean;
  isDatabase: boolean;
  command?: string;
  envVars: ResolvedEnvVar[];
  volumes: VolumeMount[];
  configFiles: ConfigFile[];
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

  return readdirSync(dirPath)
    .filter((f) => f.endsWith(".yaml"))
    .map((file) => {
      const content = readFileSync(join(dirPath, file), "utf-8");
      const validated = templateFileSchema.parse(parseYaml(content));
      return {
        id: basename(file, ".yaml"),
        name: validated.name,
        description: validated.description,
        category: validated.category,
        docs: validated.docs,
        type,
        services: validated.services,
      };
    });
}

function getTemplatesDir(): string {
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
  return loadAllTemplates().filter((t) => t.type === "service");
}

export function getProjectTemplates(): Template[] {
  return loadAllTemplates().filter((t) => t.type === "project");
}

export function getDatabaseTemplates(): Template[] {
  return loadAllTemplates().filter((t) => t.type === "database");
}

function randomBase64(bytes: number): string {
  return Buffer.from(
    Array.from({ length: bytes }, () => Math.floor(Math.random() * 256)),
  ).toString("base64");
}

async function generateSupabaseJWT(
  role: "anon" | "service_role",
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 10 * 365 * 24 * 60 * 60;

  return new jose.SignJWT({ role, iss: "supabase", iat: now, exp })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secretKey);
}

export function generateCredential(
  type:
    | "password"
    | "base64_32"
    | "base64_64"
    | "jwt_secret"
    | "jwt_anon"
    | "jwt_service_role" = "password",
): string {
  if (type === "base64_32") return randomBase64(32);
  if (type === "base64_64") return randomBase64(64);
  if (type === "jwt_secret") return nanoid(64);
  if (type === "jwt_anon" || type === "jwt_service_role") {
    throw new Error("JWT tokens require async generation with secret");
  }
  return nanoid(32);
}

export function isGeneratedValue(value: EnvValue): value is GeneratedValue {
  return typeof value === "object" && "generated" in value;
}

export async function resolveTemplateServices(
  template: Template,
): Promise<ResolvedService[]> {
  const generatedValues: Record<string, Record<string, string>> = {};

  for (const [serviceName, service] of Object.entries(template.services)) {
    generatedValues[serviceName] = {};
    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          const genType = value.generated;
          if (
            genType === "password" ||
            genType === "base64_32" ||
            genType === "base64_64" ||
            genType === "jwt_secret"
          ) {
            generatedValues[serviceName][key] = generateCredential(genType);
          }
        }
      }
    }
  }

  for (const [serviceName, service] of Object.entries(template.services)) {
    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          const genType = value.generated;
          if (genType === "jwt_anon" || genType === "jwt_service_role") {
            const jwtSecret = findJwtSecret(
              serviceName,
              service.environment,
              generatedValues,
            );
            if (!jwtSecret) {
              throw new Error(
                `jwt_secret not found for ${genType} in service ${serviceName}`,
              );
            }
            const role = genType === "jwt_anon" ? "anon" : "service_role";
            generatedValues[serviceName][key] = await generateSupabaseJWT(
              role,
              jwtSecret,
            );
          }
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

    const volumes = service.volumes?.map(parseVolumeString) ?? [];

    const configFiles: ConfigFile[] =
      service.config_files?.map((cf) => {
        let content = cf.content;
        const refPattern = /\$\{([^.]+)\.([^}]+)\}/g;
        const matches = content.matchAll(refPattern);
        for (const match of matches) {
          const [fullMatch, refService, refKey] = match;
          const refValue = generatedValues[refService]?.[refKey];
          if (refValue) {
            content = content.replace(fullMatch, refValue);
          }
        }
        return { path: cf.path, content };
      }) ?? [];

    resolved.push({
      name: serviceName,
      image: service.image,
      port: service.port,
      icon: service.icon,
      isMain: service.main ?? false,
      isDatabase: service.type === "database",
      command: service.command,
      envVars,
      volumes,
      configFiles,
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

function findJwtSecret(
  serviceName: string,
  environment: Record<string, EnvValue>,
  generatedValues: Record<string, Record<string, string>>,
): string | null {
  for (const [key, value] of Object.entries(environment)) {
    if (isGeneratedValue(value) && value.generated === "jwt_secret") {
      return generatedValues[serviceName][key];
    }
  }

  for (const [, value] of Object.entries(environment)) {
    if (typeof value === "string") {
      const refPattern = /\$\{([^.]+)\.([^}]+)\}/;
      const match = value.match(refPattern);
      if (match) {
        const [, refService, refKey] = match;
        const refValue = generatedValues[refService]?.[refKey];
        if (refValue && refKey.toLowerCase().includes("jwt")) {
          return refValue;
        }
      }
    }
  }

  return null;
}

export function clearTemplateCache(): void {
  cachedTemplates = null;
}

export { buildConnectionString } from "./connection-strings";
