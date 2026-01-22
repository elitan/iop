import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  CamelCasePlugin,
  CompiledQuery,
  Kysely,
  type Selectable,
} from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DB, Deployments, Services } from "./db-types.js";
import { getDbPath } from "./paths";

const DB_PATH = getDbPath();
const DATA_DIR = dirname(DB_PATH);

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Kysely<DB>({
  dialect: new BunSqliteDialect({
    url: DB_PATH,
    onCreateConnection: async (conn) => {
      await conn.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL"));
      await conn.executeQuery(CompiledQuery.raw("PRAGMA busy_timeout = 5000"));
      await conn.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = ON"));
    },
  }),
  plugins: [new CamelCasePlugin()],
});

export type ServiceWithDeployment = Selectable<Services> & {
  latestDeployment: Selectable<Deployments> | null;
};

export async function getLatestDeployment(
  serviceId: string,
): Promise<Selectable<Deployments> | null> {
  const deployment = await db
    .selectFrom("deployments")
    .selectAll()
    .where("serviceId", "=", serviceId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return deployment ?? null;
}

export async function addLatestDeployment<T extends Selectable<Services>>(
  service: T,
): Promise<T & { latestDeployment: Selectable<Deployments> | null }> {
  const latestDeployment = await getLatestDeployment(service.id);
  return { ...service, latestDeployment };
}

export async function addLatestDeployments<T extends Selectable<Services>>(
  services: T[],
): Promise<(T & { latestDeployment: Selectable<Deployments> | null })[]> {
  return Promise.all(services.map(addLatestDeployment));
}
