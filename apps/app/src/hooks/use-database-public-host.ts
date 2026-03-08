"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getDatabasePublicHost } from "@/lib/database-public-host";
import { orpc } from "@/lib/orpc-client";

export function useDatabasePublicHost(): string {
  const [appHost, setAppHost] = useState<string | null>(null);
  const { data: settings } = useQuery(orpc.settings.get.queryOptions());

  useEffect(function syncAppHost() {
    if (typeof window === "undefined") {
      return;
    }
    setAppHost(window.location.hostname || null);
  }, []);

  return getDatabasePublicHost({
    appHost,
    serverIp: settings?.serverIp ?? null,
  });
}
