export const DATABASE_LOGO_FALLBACK =
  "https://cdn.simpleicons.org/docker/666666";

const DATABASE_LOGO_URLS = {
  postgres: "https://cdn.simpleicons.org/postgresql",
  mysql: "https://cdn.simpleicons.org/mysql",
} as const;

const DATABASE_LOGO_ALTS = {
  postgres: "PostgreSQL logo",
  mysql: "MySQL logo",
} as const;

export function getDatabaseLogoUrl(engine: "postgres" | "mysql"): string {
  return DATABASE_LOGO_URLS[engine] ?? DATABASE_LOGO_FALLBACK;
}

export function getDatabaseLogoAlt(engine: "postgres" | "mysql"): string {
  return DATABASE_LOGO_ALTS[engine] ?? "Database logo";
}
