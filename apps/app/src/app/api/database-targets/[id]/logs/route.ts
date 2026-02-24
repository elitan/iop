import { db } from "@/lib/db";
import { streamContainerLogs } from "@/lib/docker";

interface ProviderRef {
  containerName: string;
}

function parseProviderRef(value: string): ProviderRef | null {
  try {
    const parsed = JSON.parse(value) as Partial<ProviderRef>;
    if (typeof parsed.containerName !== "string") {
      return null;
    }
    return { containerName: parsed.containerName };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get("tail") || "100", 10);

  const target = await db
    .selectFrom("databaseTargets")
    .select(["providerRefJson"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!target) {
    return new Response("Target not found", { status: 404 });
  }

  const providerRef = parseProviderRef(target.providerRefJson);
  if (!providerRef) {
    return new Response("Target container not available", { status: 500 });
  }

  const encoder = new TextEncoder();
  let stopped = false;
  let stopLogStream: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const { stop } = streamContainerLogs(providerRef.containerName, {
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
        },
        onClose() {
          if (stopped) return;
        },
      });
      stopLogStream = stop;

      request.signal.addEventListener("abort", () => {
        stopped = true;
        stopLogStream?.();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      stopped = true;
      stopLogStream?.();
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
