import { z } from "zod";
import { os } from "@/lib/orpc";
import {
  getDatabaseTemplates,
  getProjectTemplates,
  getServiceTemplates,
  getTemplates,
} from "@/lib/templates";

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

export const templates = {
  list: os
    .route({ method: "GET", path: "/templates" })
    .output(z.array(templateSchema))
    .handler(async () => {
      return getTemplates();
    }),

  services: os
    .route({ method: "GET", path: "/templates/services" })
    .output(z.array(templateSchema))
    .handler(async () => {
      return getServiceTemplates();
    }),

  projects: os
    .route({ method: "GET", path: "/templates/projects" })
    .output(z.array(templateSchema))
    .handler(async () => {
      return getProjectTemplates();
    }),

  databases: os
    .route({ method: "GET", path: "/templates/databases" })
    .output(z.array(templateSchema))
    .handler(async () => {
      return getDatabaseTemplates();
    }),
};

export const dbTemplates = {
  list: os
    .route({ method: "GET", path: "/db-templates" })
    .output(z.array(templateSchema))
    .handler(async () => {
      return getDatabaseTemplates();
    }),
};
