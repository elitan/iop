import { db } from "../src/lib/db";
import {
  createSystemDomain,
  getServerIp,
  getSystemDomainForService,
} from "../src/lib/domains";
import { runMigrations } from "../src/lib/migrate";

runMigrations();

async function ensureSystemDomains() {
  if (process.env.NODE_ENV === "development") {
    console.log("Development mode, skipping system domain creation");
    return;
  }

  let serverIp: string;
  try {
    serverIp = await getServerIp();
  } catch {
    console.log(
      "Could not determine server IP, skipping system domain creation",
    );
    return;
  }
  console.log(`Server IP: ${serverIp}`);

  const services = await db
    .selectFrom("services")
    .innerJoin("projects", "projects.id", "services.projectId")
    .select(["services.id", "services.name", "projects.name as project_name"])
    .execute();

  let created = 0;
  for (const svc of services) {
    const existing = await getSystemDomainForService(svc.id);
    if (!existing) {
      await createSystemDomain(svc.id, svc.name, svc.project_name);
      created++;
    }
  }

  if (created > 0) {
    console.log(`Created ${created} system domain(s)`);
  }
}

ensureSystemDomains()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to ensure system domains:", err);
    process.exit(1);
  });
