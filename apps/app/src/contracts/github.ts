import { oc } from "@orpc/contract";
import { z } from "zod";

const ownerSchema = z.object({
  login: z.string(),
  avatar_url: z.string(),
  type: z.enum(["User", "Organization"]),
});

const repoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
  pushed_at: z.string(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
});

const frostConfigInfoSchema = z.object({
  frostFilePath: z.string(),
  healthCheckPath: z.string().optional(),
  healthCheckTimeout: z.number().optional(),
  memoryLimit: z.string().optional(),
  cpuLimit: z.number().optional(),
});

const dockerfileInfoSchema = z.object({
  path: z.string(),
  suggestedName: z.string(),
  buildContext: z.string(),
  detectedPort: z.number().nullable(),
  frostConfig: frostConfigInfoSchema.optional(),
});

export const githubContract = {
  repos: oc
    .route({ method: "GET", path: "/github/repos" })
    .input(z.object({ mock: z.boolean().optional() }).optional())
    .output(
      z.object({
        owners: z.array(ownerSchema),
        repos: z.array(repoSchema),
      }),
    ),

  scan: oc
    .route({ method: "POST", path: "/github/scan" })
    .input(
      z.object({
        repoUrl: z.string(),
        branch: z.string(),
        repoName: z.string(),
      }),
    )
    .output(
      z.object({
        dockerfiles: z.array(dockerfileInfoSchema),
      }),
    ),
};
