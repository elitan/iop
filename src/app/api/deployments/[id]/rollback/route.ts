import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rollbackDeployment } from "@/lib/deployer";
import { imageExists } from "@/lib/docker";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const deployment = await db
    .selectFrom("deployments")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!deployment) {
    return NextResponse.json(
      { error: "Deployment not found" },
      { status: 404 },
    );
  }

  if (!deployment.imageName) {
    return NextResponse.json(
      { error: "Deployment has no image snapshot" },
      { status: 400 },
    );
  }

  const service = await db
    .selectFrom("services")
    .select("volumes")
    .where("id", "=", deployment.serviceId)
    .executeTakeFirst();

  if (service?.volumes && service.volumes !== "[]") {
    return NextResponse.json(
      { error: "Cannot rollback services with volumes" },
      { status: 400 },
    );
  }

  const exists = await imageExists(deployment.imageName);
  if (!exists) {
    return NextResponse.json(
      { error: "Image no longer available" },
      { status: 410 },
    );
  }

  try {
    const newDeploymentId = await rollbackDeployment(id);
    return NextResponse.json(
      { deployment_id: newDeploymentId },
      { status: 202 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rollback failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
