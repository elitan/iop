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

export async function streamDatabaseTargetLogs(input: {
  databaseId: string;
  targetId: string;
  tail: number;
  request: Request;
  requireBranchAlias?: boolean;
}) {
  const target = await db
    .selectFrom("databaseTargets")
    .innerJoin("databases", "databases.id", "databaseTargets.databaseId")
    .select([
      "databaseTargets.providerRefJson",
      "databaseTargets.kind",
      "databaseTargets.databaseId",
      "databases.engine",
    ])
    .where("databaseTargets.id", "=", input.targetId)
    .executeTakeFirst();

  if (!target || target.databaseId !== input.databaseId) {
    return new Response("Target not found", { status: 404 });
  }

  if (input.requireBranchAlias) {
    if (target.engine !== "postgres") {
      return new Response("Branch logs are only available for postgres", {
        status: 404,
      });
    }
    if (target.kind !== "branch") {
      return new Response("Branch not found", { status: 404 });
    }
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
        tail: input.tail,
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

      input.request.signal.addEventListener("abort", () => {
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
