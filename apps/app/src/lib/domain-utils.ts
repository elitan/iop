export function extractSubdomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return "@";
  return parts[0];
}
