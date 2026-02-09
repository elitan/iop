import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { removeTcpProxy, setupTcpProxy } from "@/lib/tcp-proxy";

async function getRunningDeploymentAndTargetHostPort(serviceId: string) {
  const deployment = await db
    .selectFrom("deployments")
    .select(["id", "hostPort"])
    .where("serviceId", "=", serviceId)
    .where("status", "=", "running")
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!deployment) {
    return { deployment: null, hostPort: null };
  }

  const replica = await db
    .selectFrom("replicas")
    .select("hostPort")
    .where("deploymentId", "=", deployment.id)
    .where("status", "=", "running")
    .where("hostPort", "is not", null)
    .orderBy("replicaIndex", "asc")
    .limit(1)
    .executeTakeFirst();

  return {
    deployment,
    hostPort: replica?.hostPort ?? deployment.hostPort ?? null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const service = await db
    .selectFrom("services")
    .select(["tcpProxyPort", "serviceType"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.serviceType !== "database") {
    return NextResponse.json(
      { error: "TCP proxy is only available for database services" },
      { status: 400 },
    );
  }

  const { hostPort } = await getRunningDeploymentAndTargetHostPort(id);

  return NextResponse.json({
    enabled: service.tcpProxyPort !== null,
    port: service.tcpProxyPort,
    hostPort,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const service = await db
    .selectFrom("services")
    .select(["tcpProxyPort", "serviceType"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.serviceType !== "database") {
    return NextResponse.json(
      { error: "TCP proxy is only available for database services" },
      { status: 400 },
    );
  }

  if (service.tcpProxyPort !== null) {
    return NextResponse.json(
      { error: "TCP proxy already enabled" },
      { status: 400 },
    );
  }

  const { hostPort } = await getRunningDeploymentAndTargetHostPort(id);

  if (!hostPort) {
    return NextResponse.json(
      { error: "Service must be deployed before enabling TCP proxy" },
      { status: 400 },
    );
  }

  await setupTcpProxy(id, hostPort);

  return NextResponse.json({
    enabled: true,
    port: hostPort,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const service = await db
    .selectFrom("services")
    .select(["tcpProxyPort", "serviceType"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.tcpProxyPort === null) {
    return NextResponse.json(
      { error: "TCP proxy not enabled" },
      { status: 400 },
    );
  }

  await removeTcpProxy(id);

  return NextResponse.json({ enabled: false, port: null });
}
