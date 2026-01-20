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
};
