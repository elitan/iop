"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export function useDemoMode(): boolean {
  const { data } = useQuery(orpc.settings.get.queryOptions());
  return data?.demoMode ?? false;
}
