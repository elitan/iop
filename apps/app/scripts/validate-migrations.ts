import { join } from "node:path";
import { getMigrationFiles } from "../src/lib/migrate";

const schemaDir = join(process.cwd(), "schema");

try {
  const migrationFiles = getMigrationFiles(schemaDir);
  console.log(`Validated ${migrationFiles.length} migration files`);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
