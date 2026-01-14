import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { deploymentsSchema } from "@/lib/db-schemas";
import { rollbackDeployment } from "@/lib/deployer";
import { imageExists } from "@/lib/docker";
import { os } from "@/lib/orpc";

export const deployments = {
  get: os
    .route({ method: "GET", path: "/deployments/{id}" })
    .input(z.object({ id: z.string() }))
    .output(deploymentsSchema)
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
