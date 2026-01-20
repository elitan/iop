import { oc } from "@orpc/contract";
import { z } from "zod";

const serviceDefinitionSchema = z.object({
  image: z.string(),
  port: z.number(),
  main: z.boolean().optional(),
  type: z.enum(["database", "app"]).optional(),
  command: z.string().optional(),
  environment: z.record(z.string(), z.unknown()).optional(),
  volumes: z.array(z.string()).optional(),
  health_check: z
    .object({
      path: z.string().optional(),
      timeout: z.number(),
    })
    .optional(),
  ssl: z.boolean().optional(),
});

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  docs: z.string().optional(),
  type: z.enum(["database", "service", "project"]),
  services: z.record(z.string(), serviceDefinitionSchema),
});

export const templatesContract = {
  list: oc
    .route({ method: "GET", path: "/templates" })
    .output(z.array(templateSchema)),

  services: oc
    .route({ method: "GET", path: "/templates/services" })
    .output(z.array(templateSchema)),

  projects: oc
    .route({ method: "GET", path: "/templates/projects" })
    .output(z.array(templateSchema)),

  databases: oc
    .route({ method: "GET", path: "/templates/databases" })
    .output(z.array(templateSchema)),
};

export const dbTemplatesContract = {
  list: oc
    .route({ method: "GET", path: "/db-templates" })
    .output(z.array(templateSchema)),
};
