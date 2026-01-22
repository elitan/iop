import { z } from "zod";
import { deploymentsSchema, servicesSchema } from "@/lib/db-schemas";

export const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const volumeConfigSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string().startsWith("/"),
});

export const serviceWithDeploymentSchema = servicesSchema.extend({
  latestDeployment: deploymentsSchema.nullable(),
});
