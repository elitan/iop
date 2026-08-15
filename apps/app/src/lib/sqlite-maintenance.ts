import { Database } from "bun:sqlite";
import { getDbPath } from "./paths";

const DEFAULT_MIN_FREE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MIN_FREE_RATIO = 0.25;

interface PragmaValue {
  [key: string]: number;
}

export interface SqliteCompactionOptions {
  dbPath?: string;
  minFreeBytes?: number;
  minFreeRatio?: number;
}

function readPragmaNumber(sqlite: Database, pragma: string): number {
  const row = sqlite.query(`PRAGMA ${pragma}`).get() as PragmaValue | null;
  if (!row) return 0;

  const value = Object.values(row)[0];
  return typeof value === "number" ? value : 0;
}

export function compactSqliteDatabase(
  options: SqliteCompactionOptions = {},
): number {
  const sqlite = new Database(options.dbPath ?? getDbPath());
  sqlite.exec("PRAGMA busy_timeout = 30000");

  try {
    const pageSize = readPragmaNumber(sqlite, "page_size");
    const pageCount = readPragmaNumber(sqlite, "page_count");
    const freePages = readPragmaNumber(sqlite, "freelist_count");
    const freeBytes = pageSize * freePages;
    const freeRatio = pageCount > 0 ? freePages / pageCount : 0;
    const minFreeBytes = options.minFreeBytes ?? DEFAULT_MIN_FREE_BYTES;
    const minFreeRatio = options.minFreeRatio ?? DEFAULT_MIN_FREE_RATIO;

    if (freeBytes < minFreeBytes || freeRatio < minFreeRatio) {
      return 0;
    }

    sqlite.exec("VACUUM");

    const compactedPageCount = readPragmaNumber(sqlite, "page_count");
    return Math.max(0, pageCount - compactedPageCount) * pageSize;
  } finally {
    sqlite.close();
  }
}
