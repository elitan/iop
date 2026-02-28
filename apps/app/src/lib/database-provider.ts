export type DatabaseProvider = "postgres-docker" | "mysql-docker";

export function normalizeDatabaseProvider(value: string): DatabaseProvider {
  if (value === "mysql-docker") {
    return "mysql-docker";
  }
  return "postgres-docker";
}
