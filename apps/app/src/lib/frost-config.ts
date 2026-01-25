import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const frostConfigSchema = z.object({
  dockerfile: z.string().optional(),
  port: z.number().min(1).max(65535).optional(),
  health_check: z
    .object({
      path: z.string().optional(),
      timeout: z.number().optional(),
    })
    .optional(),
  resources: z
    .object({
      memory: z
        .string()
        .regex(/^\d+[kmg]$/i)
        .optional(),
      cpu: z.number().min(0.1).max(64).optional(),
    })
    .optional(),
});

export type FrostConfig = z.infer<typeof frostConfigSchema>;

export function parseFrostConfig(content: string): FrostConfig {
  const parsed = parseYaml(content);
  return frostConfigSchema.parse(parsed);
}
