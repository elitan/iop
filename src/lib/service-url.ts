import type { Domain } from "@/lib/api";

export function getPreferredDomain(domains: Domain[]): Domain | null {
  const verified = domains.filter((d) => d.dnsVerified === 1);
  return (
    verified.find((d) => d.isSystem === 0) ??
    verified.find((d) => d.isSystem === 1) ??
    null
  );
}

export function getServiceUrl(
  domains: Domain[],
  serverIp: string | null,
  hostPort: number | null,
): string | null {
  const domain = getPreferredDomain(domains);
  if (domain) return domain.domain;
  if (serverIp && hostPort) return `${serverIp}:${hostPort}`;
  return null;
}
