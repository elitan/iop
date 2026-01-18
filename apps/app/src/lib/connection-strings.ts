export function buildConnectionString(
  imageUrl: string,
  host: string,
  port: number,
  envVars: Record<string, string>,
): string {
  if (imageUrl.includes("postgres")) {
    return `postgresql://${envVars.POSTGRES_USER}:${envVars.POSTGRES_PASSWORD}@${host}:${port}/${envVars.POSTGRES_DB}?sslmode=require`;
  }
  if (imageUrl.includes("mysql")) {
    return `mysql://root:${envVars.MYSQL_ROOT_PASSWORD}@${host}:${port}/${envVars.MYSQL_DATABASE}`;
  }
  if (imageUrl.includes("redis")) {
    return `redis://${host}:${port}`;
  }
  if (imageUrl.includes("mongo")) {
    return `mongodb://${envVars.MONGO_INITDB_ROOT_USERNAME}:${envVars.MONGO_INITDB_ROOT_PASSWORD}@${host}:${port}`;
  }
  return "";
}
