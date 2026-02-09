"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseBuildLogsOptions {
  deploymentId: string;
  enabled?: boolean;
  shouldReconnect?: boolean;
}

interface UseBuildLogsResult {
  logs: string[];
  isConnected: boolean;
  error: string | null;
}

const MAX_LINES = 1000;
const RECONNECT_DELAY = 2000;

export function useBuildLogs({
  deploymentId,
  enabled = true,
  shouldReconnect = true,
}: UseBuildLogsOptions): UseBuildLogsResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(shouldReconnect);

  const disconnect = useCallback(function disconnect() {
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
      if (!deploymentId || !enabled) return;

      disconnect();
      shouldReconnectRef.current = shouldReconnect;
      setLogs([]);
      setError(null);

      const es = new EventSource(`/api/deployments/${deploymentId}/build-logs`);
      eventSourceRef.current = es;

      es.onopen = function onopen() {
        setIsConnected(true);
        setError(null);
      };

      es.onmessage = function onmessage(event) {
        try {
          const data = JSON.parse(event.data);
          if (typeof data === "object" && data.error) {
            setError(data.error);
            return;
          }
          if (typeof data === "string") {
            setLogs(function updateLogs(prev) {
              const next = [...prev, data];
              if (next.length > MAX_LINES) {
                return next.slice(-MAX_LINES);
              }
              return next;
            });
          }
        } catch {
          setLogs(function updateLogs(prev) {
            const next = [...prev, event.data];
            if (next.length > MAX_LINES) {
              return next.slice(-MAX_LINES);
            }
            return next;
          });
        }
      };

      es.onerror = function onerror() {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;

        if (enabled && shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(function reconnect() {
            connect();
          }, RECONNECT_DELAY);
        }
      };
    },
    [deploymentId, disconnect, enabled, shouldReconnect],
  );

  useEffect(
    function effectConnect() {
      if (deploymentId && enabled) {
        connect();
      } else {
        disconnect();
        setLogs([]);
        setError(null);
      }

      return disconnect;
    },
    [connect, deploymentId, disconnect, enabled],
  );

  useEffect(
    function effectShouldReconnect() {
      shouldReconnectRef.current = shouldReconnect;
    },
    [shouldReconnect],
  );

  return { logs, isConnected, error };
}
