import type { Domain } from "@/lib/api";

export function getGitHubRepoFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

export function getPreferredDomain(domains: Domain[]): Domain | null {
  const verified = domains.filter((d) => d.dnsVerified);
  return (
    verified.find((d) => !d.isSystem) ??
    verified.find((d) => d.isSystem) ??
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
