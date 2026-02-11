"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseRuntimeLogsOptions {
  deploymentId: string;
  replica?: number;
}

interface UseRuntimeLogsResult {
  logs: string[];
  isConnected: boolean;
  error: string | null;
}

const MAX_LINES = 1000;
const RECONNECT_DELAY = 2000;

export function useRuntimeLogs({
  deploymentId,
  replica,
}: UseRuntimeLogsOptions): UseRuntimeLogsResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const activeStreamKeyRef = useRef<string | null>(null);
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
      if (!deploymentId) return;

      disconnect();
      shouldReconnectRef.current = true;
      setError(null);

      const streamKey = `${deploymentId}:${replica ?? "all"}`;
      const streamChanged = activeStreamKeyRef.current !== streamKey;
      if (streamChanged) {
        activeStreamKeyRef.current = streamKey;
        lineCountRef.current = 0;
        setLogs([]);
      }

      const replicaParam = replica !== undefined ? `&replica=${replica}` : "";
      const tail = lineCountRef.current > 0 ? 0 : 100;
      const es = new EventSource(
        `/api/deployments/${deploymentId}/logs?tail=${tail}${replicaParam}`,
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
            const newLogs = [...prev, data];
            const next =
              newLogs.length > MAX_LINES ? newLogs.slice(-MAX_LINES) : newLogs;
            lineCountRef.current = next.length;
            return next;
          });
        } catch {
          setLogs((prev) => {
            const newLogs = [...prev, event.data];
            const next =
              newLogs.length > MAX_LINES ? newLogs.slice(-MAX_LINES) : newLogs;
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
    [deploymentId, disconnect, replica],
  );

  useEffect(() => {
    if (deploymentId) {
      connect();
    }
    return disconnect;
  }, [deploymentId, connect, disconnect]);

  return { logs, isConnected, error };
}
