import type { Selectable } from "kysely";
import { nanoid } from "nanoid";
import { db } from "./db";
import type { Services } from "./db-types";
import { createWildcardDomain } from "./domains";
import { generateSelfSignedCert } from "./ssl";

export interface CreateServiceInput {
  id?: string;
  environmentId: string;
  name: string;
  hostname: string;
  deployType: "repo" | "image";
  serviceType?: "app" | "database";
  repoUrl?: string | null;
  branch?: string | null;
  dockerfilePath?: string | null;
  buildContext?: string | null;
  imageUrl?: string | null;
  registryId?: string | null;
  envVars?: { key: string; value: string }[];
  containerPort?: number | null;
  healthCheckPath?: string | null;
  healthCheckTimeout?: number | null;
  memoryLimit?: string | null;
  cpuLimit?: number | null;
  shutdownTimeout?: number | null;
  requestTimeout?: number | null;
  volumes?: { name: string; path: string }[];
  command?: string | null;
  icon?: string | null;
  autoDeploy?: boolean;
  ssl?: boolean;
  wildcardDomain?: {
    projectHostname: string;
    environmentName?: string;
  };
}

export async function createService(
  input: CreateServiceInput,
): Promise<Selectable<Services>> {
  const id = input.id ?? nanoid();
  const now = Date.now();

  await db
    .insertInto("services")
    .values({
      id,
      environmentId: input.environmentId,
      name: input.name,
      hostname: input.hostname,
      deployType: input.deployType,
      serviceType: input.serviceType ?? "app",
      repoUrl: input.repoUrl ?? null,
      branch: input.branch ?? null,
      dockerfilePath: input.dockerfilePath ?? null,
      buildContext: input.buildContext ?? null,
      imageUrl: input.imageUrl ?? null,
      registryId: input.registryId ?? null,
      envVars: JSON.stringify(input.envVars ?? []),
      containerPort: input.containerPort ?? null,
      healthCheckPath: input.healthCheckPath ?? null,
      healthCheckTimeout: input.healthCheckTimeout ?? null,
      memoryLimit: input.memoryLimit ?? null,
      cpuLimit: input.cpuLimit ?? null,
      shutdownTimeout: input.shutdownTimeout ?? null,
      requestTimeout: input.requestTimeout ?? null,
      volumes: JSON.stringify(input.volumes ?? []),
      command: input.command ?? null,
      icon: input.icon ?? null,
      autoDeploy: input.autoDeploy ?? false,
      createdAt: now,
    })
    .execute();

  if (input.ssl) {
    await generateSelfSignedCert(id);
  }

  if (input.wildcardDomain) {
    await createWildcardDomain(
      id,
      input.environmentId,
      input.hostname,
      input.wildcardDomain.projectHostname,
      input.wildcardDomain.environmentName,
    );
  }

  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

  return service;
}
