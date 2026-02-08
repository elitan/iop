const DEFAULT_SECRET = "frost-default-secret-change-me";

const REQUIRED_SECRET_ERROR =
  "FROST_JWT_SECRET must be set and must not use the default value";

export function getRequiredJwtSecret(): string {
  const secret = process.env.FROST_JWT_SECRET;

  // Keep tests deterministic without requiring per-test env setup.
  if (process.env.NODE_ENV === "test") {
    return secret && secret !== DEFAULT_SECRET ? secret : "frost-test-secret";
  }

  if (!secret || secret === DEFAULT_SECRET) {
    throw new Error(REQUIRED_SECRET_ERROR);
  }

  return secret;
}
