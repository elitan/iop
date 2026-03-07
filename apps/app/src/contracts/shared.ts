import { z } from "zod";
import { deploymentsSchema, servicesSchema } from "@/lib/db-schemas";

export const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const volumeConfigSchema = z.object({
  name: z.string().regex(/^[a-z0-9._-]+$/),
  path: z.string().startsWith("/"),
});

export const serviceRuntimeStatusSchema = z.enum([
  "not-deployed",
  "starting",
  "online",
  "offline",
]);

export const serviceAttentionStatusSchema = z
  .enum(["updating", "last-deploy-failed"])
  .nullable();

export const serviceWithDeploymentSchema = servicesSchema.extend({
  latestDeployment: deploymentsSchema.nullable(),
  runtimeStatus: serviceRuntimeStatusSchema,
  attentionStatus: serviceAttentionStatusSchema,
});
