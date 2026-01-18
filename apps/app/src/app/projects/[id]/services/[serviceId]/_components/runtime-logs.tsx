"use client";

import { ArrowDown, Circle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRuntimeLogs } from "@/hooks/use-runtime-logs";
import { cn } from "@/lib/utils";

interface RuntimeLogsProps {
  deploymentId: string;
}

function parseLogLine(line: string): {
  timestamp: string | null;
  content: string;
} {
  const match = line.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s(.*)$/,
  );
  if (match) {
    return { timestamp: match[1], content: match[2] };
  }
  return { timestamp: null, content: line };
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RuntimeLogs({ deploymentId }: RuntimeLogsProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLPreElement>(null);

  const { logs, isConnected, error } = useRuntimeLogs({ deploymentId });

  useEffect(
    function scrollToBottom() {
      if (logs.length > 0 && autoScroll && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    },
    [logs, autoScroll],
  );

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 pb-3">
        <Circle
          className={cn(
            "h-2 w-2",
            isConnected
              ? "fill-green-500 text-green-500"
              : "fill-neutral-500 text-neutral-500",
          )}
        />
        <span className="text-xs text-neutral-500">
          {isConnected ? "Live" : "Reconnecting..."}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <pre
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 max-h-96 overflow-auto rounded bg-neutral-950 p-4 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <span className="text-neutral-600">Waiting for logs...</span>
        ) : (
          logs.map((line, i) => {
            const { timestamp, content } = parseLogLine(line);
            return (
              <div key={`${i}-${line.slice(0, 50)}`} className="leading-5">
                {timestamp && (
                  <span className="mr-3 text-neutral-600">
                    {formatTimestamp(timestamp)}
                  </span>
                )}
                <span className="text-neutral-400">{content}</span>
              </div>
            );
          })
        )}
      </pre>

      {!autoScroll && logs.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop =
                containerRef.current.scrollHeight;
            }
          }}
          className="mx-auto mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
        >
          <ArrowDown className="h-3 w-3" />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
