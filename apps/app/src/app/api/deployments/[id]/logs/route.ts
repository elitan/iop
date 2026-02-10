import { db } from "@/lib/db";
import { streamContainerLogs } from "@/lib/docker";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get("tail") || "100", 10);
  const replicaFilter = url.searchParams.get("replica");

  const deployment = await db
    .selectFrom("deployments")
    .select(["containerId", "status"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!deployment) {
    return new Response("Deployment not found", { status: 404 });
  }

  const replicas = await db
    .selectFrom("replicas")
    .select(["containerId", "replicaIndex"])
    .where("deploymentId", "=", id)
    .where("status", "=", "running")
    .where("containerId", "is not", null)
    .orderBy("replicaIndex", "asc")
    .execute();

  type ReplicaContainer = { containerId: string; index: number };
  let containers: ReplicaContainer[];

  if (replicas.length > 0) {
    containers = replicas
      .filter(
        (r): r is typeof r & { containerId: string } => r.containerId !== null,
      )
      .map((r) => ({ containerId: r.containerId, index: r.replicaIndex }));

    if (replicaFilter !== null) {
      const filterIdx = parseInt(replicaFilter, 10);
      containers = containers.filter((c) => c.index === filterIdx);
    }
  } else if (deployment.containerId) {
    containers = [{ containerId: deployment.containerId, index: 0 }];
  } else {
    return new Response("Container not found", { status: 404 });
  }

  if (containers.length === 0) {
    return new Response("Replica not found", { status: 404 });
  }

  const multiReplica = replicas.length > 1 && replicaFilter === null;
  const encoder = new TextEncoder();
  let stopped = false;
  const stopFns: (() => void)[] = [];

  const stream = new ReadableStream({
    start(controller) {
      for (const container of containers) {
        const { stop } = streamContainerLogs(container.containerId, {
          tail,
          timestamps: true,
          onData(line) {
            if (stopped) return;
            const prefixed = multiReplica
              ? `[replica-${container.index}] ${line}`
              : line;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(prefixed)}\n\n`),
            );
          },
          onError(err) {
            if (stopped) return;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: err.message })}\n\n`,
              ),
            );
          },
          onClose() {
            if (stopped) return;
          },
        });
        stopFns.push(stop);
      }

      request.signal.addEventListener("abort", () => {
        stopped = true;
        for (const fn of stopFns) fn();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      stopped = true;
      for (const fn of stopFns) fn();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
