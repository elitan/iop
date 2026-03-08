import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { nanoid } from "nanoid";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { buildPostgresConnectionString } from "./connection-strings";

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
  icon: z.string().optional(),
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

export interface TemplateReferenceValues {
  [serviceName: string]: Record<string, string>;
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
  icon?: string;
  isMain: boolean;
  isDatabase: boolean;
  command?: string;
  envVars: ResolvedEnvVar[];
  volumes: VolumeMount[];
  healthCheckPath?: string;
  healthCheckTimeout: number;
  ssl: boolean;
}

export interface ResolveTemplateServicesOptions {
  excludeServices?: string[];
  referenceValues?: TemplateReferenceValues;
}

type TemplateDatabaseEngine = "postgres" | "mysql";

export type ManagedTemplateDatabaseEngine = "postgres";

export interface ManagedTemplateDatabase {
  name: string;
  engine: ManagedTemplateDatabaseEngine;
  image: string;
}

function parseVolumeString(vol: string): VolumeMount {
  const parts = vol.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid volume format: ${vol}`);
  }
  return { name: parts[0], path: parts[1] };
}

function detectTemplateDatabaseEngine(
  image: string,
): TemplateDatabaseEngine | null {
  const normalized = image.toLowerCase();

  if (normalized.includes("postgres")) {
    return "postgres";
  }

  if (normalized.includes("mysql")) {
    return "mysql";
  }

  return null;
}

function detectManagedTemplateDatabaseEngine(
  image: string,
): ManagedTemplateDatabaseEngine | null {
  const engine = detectTemplateDatabaseEngine(image);

  if (engine === "postgres") {
    return engine;
  }

  return null;
}

function buildMysqlConnectionString(input: {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}): string {
  const user = encodeURIComponent(input.username);
  const password = encodeURIComponent(input.password);
  const database = encodeURIComponent(input.database);

  return `mysql://${user}:${password}@${input.host}:${input.port}/${database}`;
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
  const directDir = join(process.cwd(), "templates");
  if (existsSync(directDir)) {
    return directDir;
  }

  return join(process.cwd(), "apps", "app", "templates");
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

export function generateCredential(
  type: "password" | "base64_32" | "base64_64" = "password",
): string {
  if (type === "base64_32") return randomBase64(32);
  if (type === "base64_64") return randomBase64(64);
  return nanoid(32);
}

export function isGeneratedValue(value: EnvValue): value is GeneratedValue {
  return typeof value === "object" && "generated" in value;
}

function buildTemplateEnvValues(template: Template): TemplateReferenceValues {
  const envValuesByService: TemplateReferenceValues = {};

  for (const [serviceName, service] of Object.entries(template.services)) {
    envValuesByService[serviceName] = {};

    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          envValuesByService[serviceName][key] = generateCredential(
            value.generated,
          );
        } else {
          envValuesByService[serviceName][key] = value;
        }
      }
    }
  }

  return envValuesByService;
}

function buildServiceReferenceValues(
  serviceName: string,
  service: ServiceDefinition,
  envValues: Record<string, string>,
): Record<string, string> {
  const refs = { ...envValues };

  refs.HOST ??= serviceName;
  refs.PORT ??= String(service.port);

  const engine = detectTemplateDatabaseEngine(service.image);

  if (engine === "postgres") {
    const username = refs.POSTGRES_USER ?? "postgres";
    const password = refs.POSTGRES_PASSWORD ?? "";
    const database = refs.POSTGRES_DB ?? "postgres";

    refs.USERNAME ??= username;
    refs.PASSWORD ??= password;
    refs.DATABASE ??= database;

    if (password && refs.DATABASE_URL === undefined) {
      refs.DATABASE_URL = buildPostgresConnectionString({
        username,
        password,
        host: refs.HOST,
        port: service.port,
        database,
        ssl: service.ssl ?? false,
      });
    }
  }

  if (engine === "mysql") {
    const username = refs.MYSQL_USER ?? "root";
    const password = refs.MYSQL_PASSWORD ?? refs.MYSQL_ROOT_PASSWORD ?? "";
    const database = refs.MYSQL_DATABASE ?? "mysql";

    refs.USERNAME ??= username;
    refs.PASSWORD ??= password;
    refs.DATABASE ??= database;

    if (password && refs.DATABASE_URL === undefined) {
      refs.DATABASE_URL = buildMysqlConnectionString({
        username,
        password,
        host: refs.HOST,
        port: service.port,
        database,
      });
    }
  }

  return refs;
}

function buildTemplateReferenceValues(input: {
  template: Template;
  envValuesByService: TemplateReferenceValues;
  overrideValues?: TemplateReferenceValues;
}): TemplateReferenceValues {
  const referenceValues: TemplateReferenceValues = {};

  for (const [serviceName, service] of Object.entries(
    input.template.services,
  )) {
    referenceValues[serviceName] = buildServiceReferenceValues(
      serviceName,
      service,
      input.envValuesByService[serviceName] ?? {},
    );
  }

  if (input.overrideValues) {
    for (const [serviceName, values] of Object.entries(input.overrideValues)) {
      referenceValues[serviceName] = {
        ...(referenceValues[serviceName] ?? {}),
        ...values,
      };
    }
  }

  return referenceValues;
}

function resolveTemplateValue(
  value: string,
  referenceValues: TemplateReferenceValues,
): string {
  let resolvedValue = value;
  const refPattern = /\$\{([^.]+)\.([^}]+)\}/g;
  const matches = value.matchAll(refPattern);

  for (const match of matches) {
    const [fullMatch, refService, refKey] = match;
    const refValue = referenceValues[refService]?.[refKey];

    if (refValue !== undefined) {
      resolvedValue = resolvedValue.replace(fullMatch, refValue);
    }
  }

  return resolvedValue;
}

export function getManagedTemplateDatabases(
  template: Template,
): ManagedTemplateDatabase[] {
  const databases: ManagedTemplateDatabase[] = [];

  for (const [serviceName, service] of Object.entries(template.services)) {
    if (service.type !== "database") {
      continue;
    }

    const engine = detectManagedTemplateDatabaseEngine(service.image);
    if (!engine) {
      continue;
    }

    databases.push({
      name: serviceName,
      engine,
      image: service.image,
    });
  }

  return databases;
}

export function resolveTemplateServices(
  template: Template,
  options: ResolveTemplateServicesOptions = {},
): ResolvedService[] {
  const envValuesByService = buildTemplateEnvValues(template);
  const referenceValues = buildTemplateReferenceValues({
    template,
    envValuesByService,
    overrideValues: options.referenceValues,
  });
  const excludedServices = new Set(options.excludeServices ?? []);

  const resolved: ResolvedService[] = [];

  for (const [serviceName, service] of Object.entries(template.services)) {
    if (excludedServices.has(serviceName)) {
      continue;
    }

    const envVars: ResolvedEnvVar[] = [];

    if (service.environment) {
      for (const [key, value] of Object.entries(service.environment)) {
        if (isGeneratedValue(value)) {
          envVars.push({
            key,
            value: envValuesByService[serviceName][key],
            generated: true,
          });
        } else {
          envVars.push({
            key,
            value: resolveTemplateValue(
              envValuesByService[serviceName][key],
              referenceValues,
            ),
          });
        }
      }
    }

    const volumes = service.volumes?.map(parseVolumeString) ?? [];

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
      healthCheckPath: service.health_check?.path,
      healthCheckTimeout: service.health_check?.timeout ?? 60,
      ssl: service.ssl ?? false,
    });
  }

  const mainService = resolved.find(function isMainService(service) {
    return service.isMain;
  });
  if (!mainService && resolved.length > 0) {
    resolved[0].isMain = true;
  }

  return resolved;
}

export function clearTemplateCache(): void {
  cachedTemplates = null;
}

export { buildConnectionString } from "./connection-strings";
