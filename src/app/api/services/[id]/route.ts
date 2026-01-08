import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stopContainer } from "@/lib/docker";
import { syncCaddyConfig, updateSystemDomain } from "@/lib/domains";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latestDeployment = await db
    .selectFrom("deployments")
    .selectAll()
    .where("serviceId", "=", id)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();

  return NextResponse.json({ ...service, latestDeployment });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const service = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.envVars !== undefined) {
    updates.envVars = JSON.stringify(body.envVars);
  }
  if (body.containerPort !== undefined) {
    if (body.containerPort < 1 || body.containerPort > 65535) {
      return NextResponse.json(
        { error: "containerPort must be between 1 and 65535" },
        { status: 400 },
      );
    }
    updates.containerPort = body.containerPort;
  }
  if (service.deployType === "repo") {
    if (body.branch !== undefined) {
      updates.branch = body.branch;
    }
    if (body.dockerfilePath !== undefined) {
      updates.dockerfilePath = body.dockerfilePath;
    }
    if (body.repoUrl !== undefined) {
      updates.repoUrl = body.repoUrl;
    }
  }
  if (service.deployType === "image") {
    if (body.imageUrl !== undefined) {
      updates.imageUrl = body.imageUrl;
    }
  }
  if (body.healthCheckPath !== undefined) {
    updates.healthCheckPath = body.healthCheckPath;
  }
  if (body.healthCheckTimeout !== undefined) {
    if (body.healthCheckTimeout < 1 || body.healthCheckTimeout > 300) {
      return NextResponse.json(
        { error: "healthCheckTimeout must be between 1 and 300" },
        { status: 400 },
      );
    }
    updates.healthCheckTimeout = body.healthCheckTimeout;
  }
  if (body.autoDeployEnabled !== undefined) {
    updates.autoDeploy = body.autoDeployEnabled ? 1 : 0;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .updateTable("services")
      .set(updates)
      .where("id", "=", id)
      .execute();
  }

  if (body.name !== undefined && body.name !== service.name) {
    const project = await db
      .selectFrom("projects")
      .select("name")
      .where("id", "=", service.projectId)
      .executeTakeFirst();
    if (project) {
      await updateSystemDomain(id, body.name, project.name);
    }
  }

  const updated = await db
    .selectFrom("services")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const deployments = await db
    .selectFrom("deployments")
    .select("containerId")
    .where("serviceId", "=", id)
    .execute();

  for (const deployment of deployments) {
    if (deployment.containerId) {
      await stopContainer(deployment.containerId);
    }
  }

  await db.deleteFrom("services").where("id", "=", id).execute();

  try {
    await syncCaddyConfig();
  } catch {}

  return NextResponse.json({ success: true });
}
