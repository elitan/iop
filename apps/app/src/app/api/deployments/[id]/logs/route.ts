import { db } from "@/lib/db";
import { streamContainerLogs } from "@/lib/docker";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get("tail") || "100", 10);

  const deployment = await db
    .selectFrom("deployments")
    .select(["containerId", "status"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!deployment || !deployment.containerId) {
    return new Response("Container not found", { status: 404 });
  }

  if (deployment.status !== "running") {
    return new Response("Container not running", { status: 400 });
  }

  const encoder = new TextEncoder();
  let stopped = false;
  let stopFn: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const { stop } = streamContainerLogs(deployment.containerId!, {
        tail,
        timestamps: true,
        onData(line) {
          if (stopped) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(line)}\n\n`),
          );
        },
        onError(err) {
          if (stopped) return;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err.message })}\n\n`,
            ),
          );
          controller.close();
        },
        onClose() {
          if (stopped) return;
          controller.close();
        },
      });

      stopFn = stop;

      request.signal.addEventListener("abort", () => {
        stopped = true;
        if (stopFn) stopFn();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      stopped = true;
      if (stopFn) stopFn();
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
