import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMonitoringStats() {
  return useQuery({
    queryKey: ["monitoring", "stats"],
    queryFn: api.monitoring.getStats,
    refetchInterval: 2000,
  });
}

export function useMonitoringHistory(range: string) {
  return useQuery({
    queryKey: ["monitoring", "history", range],
    queryFn: () => api.monitoring.getHistory(range),
    refetchInterval: 15000,
  });
}

export function useServiceMetrics(serviceId: string, range: string = "1h") {
  return useQuery({
    queryKey: ["monitoring", "service", serviceId, range],
    queryFn: () => api.monitoring.getServiceHistory(serviceId, range),
    refetchInterval: 15000,
  });
}
