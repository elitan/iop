import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSystemDomain } from "@/lib/domains";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const services = await db
    .selectFrom("services")
    .selectAll()
    .where("projectId", "=", id)
    .execute();

  const servicesWithDeployments = await Promise.all(
    services.map(async (service) => {
      const latestDeployment = await db
        .selectFrom("deployments")
        .selectAll()
        .where("serviceId", "=", service.id)
        .orderBy("createdAt", "desc")
        .limit(1)
        .executeTakeFirst();

      return {
        ...service,
        latestDeployment,
      };
    }),
  );

  return NextResponse.json(servicesWithDeployments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const body = await request.json();
  const {
    name,
    deployType = "repo",
    repoUrl,
    branch = "main",
    dockerfilePath = "Dockerfile",
    imageUrl,
    envVars = [],
    containerPort,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (deployType === "repo" && !repoUrl) {
    return NextResponse.json(
      { error: "repoUrl is required for repo deployments" },
      { status: 400 },
    );
  }

  if (deployType === "image" && !imageUrl) {
    return NextResponse.json(
      { error: "imageUrl is required for image deployments" },
      { status: 400 },
    );
  }

  if (
    containerPort !== undefined &&
    (containerPort < 1 || containerPort > 65535)
  ) {
    return NextResponse.json(
      { error: "containerPort must be between 1 and 65535" },
      { status: 400 },
    );
  }

  const project = await db
    .selectFrom("projects")
    .select(["id", "name"])
    .where("id", "=", projectId)
    .executeTakeFirst();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = await db
    .selectFrom("services")
    .select("id")
    .where("projectId", "=", projectId)
    .where("name", "=", name)
    .executeTakeFirst();

  if (existing) {
    return NextResponse.json(
      { error: "Service with this name already exists in project" },
      { status: 400 },
    );
  }

  const id = nanoid();
  const now = Date.now();

  await db
    .insertInto("services")
    .values({
      id,
      projectId: projectId,
      name,
      deployType,
      repoUrl: deployType === "repo" ? repoUrl : null,
      branch: deployType === "repo" ? branch : null,
      dockerfilePath: deployType === "repo" ? dockerfilePath : null,
      imageUrl: deployType === "image" ? imageUrl : null,
      envVars: JSON.stringify(envVars),
      containerPort: containerPort ?? null,
      autoDeploy: deployType === "repo" ? 1 : 0,
      createdAt: now,
    })
    .execute();

  await createSystemDomain(id, name, project.name);

  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return NextResponse.json(service, { status: 201 });
}
