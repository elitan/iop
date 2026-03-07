export interface DatabaseTableReference {
  schema: string;
  name: string;
}

export type DatabaseTableSortDirection = "asc" | "desc";

export interface DatabaseTableSortState {
  sortColumn: string | null;
  sortDirection: DatabaseTableSortDirection | null;
}

export interface DatabaseTableRowsQueryInput extends DatabaseTableSortState {
  table: DatabaseTableReference;
  page: number;
  pageSize: number;
}

export const TABLE_ROW_ID_COLUMN = "__frost_ctid";
export const TABLE_TOTAL_ROWS_COLUMN = "__frost_total_rows";

function normalizePage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizePageSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeTotalRows(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function getDatabaseTableIdentifier(
  table: DatabaseTableReference,
): string {
  return `${quoteSqlIdentifier(table.schema)}.${quoteSqlIdentifier(table.name)}`;
}

export function buildTableCountQuery(table: DatabaseTableReference): string {
  return `
    select count(*)::text as "${TABLE_TOTAL_ROWS_COLUMN}"
    from ${getDatabaseTableIdentifier(table)};
  `;
}

export function buildTableRowsQuery(
  input: DatabaseTableRowsQueryInput,
): string {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const offset = page * pageSize;
  const orderBy =
    input.sortColumn && input.sortDirection
      ? `${quoteSqlIdentifier(input.sortColumn)} ${input.sortDirection} nulls last, ctid asc`
      : "ctid asc";

  return `
    select ctid::text as "${TABLE_ROW_ID_COLUMN}", *
    from ${getDatabaseTableIdentifier(input.table)}
    order by ${orderBy}
    limit ${pageSize}
    offset ${offset};
  `;
}

export function getNextTableSortState(
  current: DatabaseTableSortState,
  column: string,
): DatabaseTableSortState {
  if (current.sortColumn !== column) {
    return {
      sortColumn: column,
      sortDirection: "asc",
    };
  }

  if (current.sortDirection === "asc") {
    return {
      sortColumn: column,
      sortDirection: "desc",
    };
  }

  return {
    sortColumn: null,
    sortDirection: null,
  };
}

export function getTablePageCount(totalRows: number, pageSize: number): number {
  const normalizedTotalRows = normalizeTotalRows(totalRows);
  const normalizedPageSize = normalizePageSize(pageSize);

  if (normalizedTotalRows === 0) {
    return 1;
  }

  return Math.ceil(normalizedTotalRows / normalizedPageSize);
}

export function clampTablePage(
  page: number,
  totalRows: number,
  pageSize: number,
): number {
  const normalizedPage = normalizePage(page);
  const pageCount = getTablePageCount(totalRows, pageSize);
  return Math.min(normalizedPage, Math.max(0, pageCount - 1));
}
