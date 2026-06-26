import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface DomainSettings {
  serverIp: string | null;
  wildcardConfigured: boolean;
}

async function fetchWildcardConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/settings/wildcard");
    const data = (await response.json()) as { configured?: unknown };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export function useDomainSettings(): DomainSettings {
  const { data } = useQuery({
    queryKey: ["domain-settings"],
    queryFn: async function queryFn(): Promise<DomainSettings> {
      const [settings, wildcardConfigured] = await Promise.all([
        api.settings.get(),
        fetchWildcardConfigured(),
      ]);

      return {
        serverIp: settings.serverIp,
        wildcardConfigured,
      };
    },
  });

  return {
    serverIp: data?.serverIp ?? null,
    wildcardConfigured: data?.wildcardConfigured ?? false,
  };
}
