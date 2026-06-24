import psl from "psl";

export const DOMAIN_NAME_ERROR = "Enter a valid domain like vattensvar.se.";

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomainName(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.+$/, "");
}

export function isValidDomainName(domain: string): boolean {
  const normalized = normalizeDomainName(domain);
  const labels = normalized.split(".");

  return (
    psl.isValid(normalized) &&
    labels.length >= 2 &&
    labels.every(function isValidDnsLabel(label) {
      return DNS_LABEL_PATTERN.test(label);
    })
  );
}

export function getDomainNameValidationError(domain: string): string | null {
  if (domain.length === 0) {
    return null;
  }

  return isValidDomainName(domain) ? null : DOMAIN_NAME_ERROR;
}

export function parseDomainName(domain: string): string {
  const normalized = normalizeDomainName(domain);
  if (!isValidDomainName(normalized)) {
    throw new Error(DOMAIN_NAME_ERROR);
  }
  return normalized;
}
