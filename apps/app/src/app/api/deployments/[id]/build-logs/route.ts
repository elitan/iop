import { subscribeBuildLogChunks } from "@/lib/build-log-stream";
import { db } from "@/lib/db";

const ACTIVE_STATUSES = new Set([
  "pending",
  "cloning",
  "pulling",
  "building",
  "deploying",
  "running",
]);

function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

function encodeData(encoder: TextEncoder, value: string): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deployment = await db
    .selectFrom("deployments")
    .select(["status", "buildLog"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!deployment) {
    return new Response("Deployment not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = function cleanup() {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let lineBuffer = "";
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      function pushChunk(chunk: string): void {
        if (!chunk) return;
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(encodeData(encoder, line));
        }
      }

      function handleAbort(): void {
        stop();
      }

      const unsubscribe = subscribeBuildLogChunks(id, function onChunk(chunk) {
        if (stopped) return;
        pushChunk(chunk);
      });

      function stop(): void {
        if (stopped) return;
        stopped = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        unsubscribe();
        request.signal.removeEventListener("abort", handleAbort);
        if (lineBuffer) {
          controller.enqueue(encodeData(encoder, lineBuffer));
          lineBuffer = "";
        }
        try {
          controller.close();
        } catch {}
      }

      pushChunk(deployment.buildLog ?? "");

      request.signal.addEventListener("abort", handleAbort);

      if (isActiveStatus(deployment.status)) {
        heartbeat = setInterval(function sendHeartbeat() {
          if (stopped) return;
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15000);
      } else {
        stop();
      }

      cleanup = stop;
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
