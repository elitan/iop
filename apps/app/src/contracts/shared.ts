import { z } from "zod";

export const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const volumeConfigSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string().startsWith("/"),
});
