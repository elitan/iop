import { z } from "zod";
import {
  DOMAIN_NAME_ERROR,
  isValidDomainName,
  normalizeDomainName,
} from "@/lib/domain-validation";

function normalizeWildcardDomainName(domain: string): string {
  const normalized = normalizeDomainName(domain);
  return normalized.replace(/^\*\./, "");
}

function createDomainNameSchema(normalize: (domain: string) => string) {
  return z
    .string()
    .min(1, DOMAIN_NAME_ERROR)
    .transform(normalize)
    .refine(isValidDomainName, { message: DOMAIN_NAME_ERROR });
}

export const domainNameSchema = createDomainNameSchema(normalizeDomainName);

export const wildcardDomainNameSchema = createDomainNameSchema(
  normalizeWildcardDomainName,
);
