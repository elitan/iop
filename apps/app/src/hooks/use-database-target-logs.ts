"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseDatabaseTargetLogsOptions {
  targetId: string;
}

interface UseDatabaseTargetLogsResult {
  logs: string[];
  isConnected: boolean;
  error: string | null;
}

const MAX_LINES = 1000;
const RECONNECT_DELAY = 2000;

export function useDatabaseTargetLogs({
  targetId,
}: UseDatabaseTargetLogsOptions): UseDatabaseTargetLogsResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const activeTargetIdRef = useRef<string | null>(null);
  const lineCountRef = useRef(0);

  const disconnect = useCallback(function disconnect() {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(
    function connect() {
      if (!targetId) return;

      disconnect();
      shouldReconnectRef.current = true;
      setError(null);

      const streamChanged = activeTargetIdRef.current !== targetId;
      if (streamChanged) {
        activeTargetIdRef.current = targetId;
        lineCountRef.current = 0;
        setLogs([]);
      }

      const tail = lineCountRef.current > 0 ? 0 : 100;
      const es = new EventSource(
        `/api/database-targets/${targetId}/logs?tail=${tail}`,
      );
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data === "object" && data.error) {
            setError(data.error);
            return;
          }
          setLogs((prev) => {
            const nextLogs = [...prev, data];
            const next =
              nextLogs.length > MAX_LINES
                ? nextLogs.slice(-MAX_LINES)
                : nextLogs;
            lineCountRef.current = next.length;
            return next;
          });
        } catch {
          setLogs((prev) => {
            const nextLogs = [...prev, event.data];
            const next =
              nextLogs.length > MAX_LINES
                ? nextLogs.slice(-MAX_LINES)
                : nextLogs;
            lineCountRef.current = next.length;
            return next;
          });
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;

        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        }
      };
    },
    [targetId, disconnect],
  );

  useEffect(() => {
    if (targetId) {
      connect();
    }
    return disconnect;
  }, [targetId, connect, disconnect]);

  return { logs, isConnected, error };
}
