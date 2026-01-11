import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rollbackDeployment } from "@/lib/deployer";
import { imageExists } from "@/lib/docker";
import { os } from "@/lib/orpc";

const deploymentSchema = z
  .object({
    id: z.string(),
    serviceId: z.string(),
    projectId: z.string(),
    status: z.string(),
    commitSha: z.string().nullable(),
    commitMessage: z.string().nullable(),
    containerId: z.string().nullable(),
    hostPort: z.number().nullable(),
    buildLog: z.string().nullable(),
    createdAt: z.number(),
    imageName: z.string().nullable(),
    rollbackEligible: z.number().nullable(),
  })
  .passthrough();

export const deployments = {
  get: os
    .route({ method: "GET", path: "/deployments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(deploymentSchema)
    .handler(async ({ input }) => {
      const deployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!deployment) {
        throw new ORPCError("NOT_FOUND", { message: "Deployment not found" });
      }

      return deployment;
    }),

  rollback: os
    .route({ method: "POST", path: "/deployments/{id}/rollback" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ deploymentId: z.string() }))
    .handler(async ({ input }) => {
      const deployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!deployment) {
        throw new ORPCError("NOT_FOUND", { message: "Deployment not found" });
      }

      if (!deployment.imageName) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Deployment has no image snapshot",
        });
      }

      const service = await db
        .selectFrom("services")
        .select("volumes")
        .where("id", "=", deployment.serviceId)
        .executeTakeFirst();

      if (service?.volumes && service.volumes !== "[]") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cannot rollback services with volumes",
        });
      }

      const exists = await imageExists(deployment.imageName);
      if (!exists) {
        throw new ORPCError("GONE", { message: "Image no longer available" });
      }

      const newDeploymentId = await rollbackDeployment(input.id);
      return { deploymentId: newDeploymentId };
    }),
};
