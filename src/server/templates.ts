import { z } from "zod";
import { DATABASE_TEMPLATES } from "@/lib/db-templates";
import { os } from "@/lib/orpc";
import { SERVICE_TEMPLATES } from "@/lib/templates";

const serviceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  description: z.string(),
  containerPort: z.number().optional(),
});

const volumeMountSchema = z.object({
  name: z.string(),
  path: z.string(),
});

const dbTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  containerPort: z.number(),
  envVars: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      generated: z.boolean().optional(),
    }),
  ),
  volumes: z.array(volumeMountSchema),
  healthCheckTimeout: z.number(),
  supportsSSL: z.boolean(),
});

export const templates = {
  list: os
    .route({ method: "GET", path: "/templates" })
    .output(z.array(serviceTemplateSchema))
    .handler(async () => {
      return SERVICE_TEMPLATES;
    }),
};

export const dbTemplates = {
  list: os
    .route({ method: "GET", path: "/db-templates" })
    .output(z.array(dbTemplateSchema))
    .handler(async () => {
      return DATABASE_TEMPLATES;
    }),
};
