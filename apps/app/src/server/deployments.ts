import { ORPCError } from "@orpc/server";
import { db } from "@/lib/db";
import { rollbackDeployment } from "@/lib/deployer";
import { imageExists } from "@/lib/docker";
import { os } from "./orpc";

export const deployments = {
  get: os.deployments.get.handler(async ({ input }) => {
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

  listByEnvironment: os.deployments.listByEnvironment.handler(
    async ({ input }) => {
      return db
        .selectFrom("deployments")
        .selectAll()
        .where("environmentId", "=", input.environmentId)
        .orderBy("createdAt", "desc")
        .limit(50)
        .execute();
    },
  ),

  rollback: os.deployments.rollback.handler(async ({ input }) => {
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
