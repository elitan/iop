"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContractOutputs } from "@/contracts";
import { useRunDatabaseTargetSql } from "@/hooks/use-databases";
import {
  buildTableCountQuery,
  buildTableRowsQuery,
  clampTablePage,
  type DatabaseTableSortDirection,
  getDatabaseTableIdentifier,
  getNextTableSortState,
  getTablePageCount,
  quoteSqlIdentifier,
  TABLE_ROW_ID_COLUMN,
  TABLE_TOTAL_ROWS_COLUMN,
} from "./database-table-browser-queries";

interface DatabaseTableBrowserProps {
  databaseId: string;
  targetId: string;
  branchName: string;
  isBranchActive: boolean;
}

interface DatabaseTableItem {
  key: string;
  schema: string;
  name: string;
}

interface DatabaseTableColumn {
  name: string;
  dataType: string;
}

interface DatabaseTableRow {
  ctid: string;
  values: Record<string, string>;
}

interface TableFieldDraft {
  id: string;
  column: string;
  value: string;
  isNull: boolean;
}

interface CreateTableColumnDraft {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
}

interface TableFieldEditorProps {
  fields: TableFieldDraft[];
  columns: DatabaseTableColumn[];
  disabled: boolean;
  addLabel?: string;
  emptyLabel: string;
  allowColumnChange?: boolean;
  allowAddRemove?: boolean;
  onAddField?: () => void;
  onChangeField: (fieldId: string, patch: Partial<TableFieldDraft>) => void;
  onRemoveField?: (fieldId: string) => void;
}

type DatabaseTargetSqlResult = ContractOutputs["databases"]["runTargetSql"];

const BOOLEAN_TYPES = new Set(["boolean"]);
const INTEGER_TYPES = new Set(["smallint", "integer", "bigint"]);
const NUMBER_TYPES = new Set([
  "real",
  "double precision",
  "numeric",
  "decimal",
]);
const JSON_TYPES = new Set(["json", "jsonb"]);
const SQL_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_TABLE_PAGE_SIZE = 50;
const TABLE_SCROLL_FADE_THRESHOLD = 8;
const TABLE_ACTION_RAIL_EDGE_CLASS =
  "border-l border-neutral-800 before:pointer-events-none before:absolute before:inset-y-0 before:-left-14 before:w-14 before:bg-gradient-to-r before:from-transparent before:content-['']";
const TABLE_ACTION_HEADER_CLASS = `sticky top-0 right-0 z-30 w-28 min-w-28 bg-[rgb(20,20,20)] px-3 py-2 text-xs font-medium text-neutral-300 before:to-[rgb(20,20,20)] ${TABLE_ACTION_RAIL_EDGE_CLASS}`;
const TABLE_ACTION_CELL_CLASS = `sticky right-0 z-10 w-28 min-w-28 bg-[rgb(20,20,20)] px-3 py-2 align-top before:to-[rgb(20,20,20)] group-hover:bg-[rgb(24,24,24)] group-hover:before:to-[rgb(24,24,24)] ${TABLE_ACTION_RAIL_EDGE_CLASS}`;
const TABLE_ACTION_CELL_EDITING_CLASS = `sticky right-0 z-10 w-28 min-w-28 bg-[rgb(28,28,28)] px-3 py-2 align-top before:to-[rgb(28,28,28)] ${TABLE_ACTION_RAIL_EDGE_CLASS}`;
const CREATE_COLUMN_TYPE_OPTIONS = [
  "text",
  "integer",
  "bigint",
  "numeric",
  "boolean",
  "date",
  "timestamp",
  "timestamptz",
  "jsonb",
  "uuid",
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

interface DraftWithId {
  id: string;
}

interface LoadSelectedTableDataOptions {
  page: number;
  pageSize: number;
  sortColumn: string | null;
  sortDirection: DatabaseTableSortDirection | null;
  reloadMetadata: boolean;
  metadataReloadKey: number;
  tableDataReloadKey: number;
}

function createDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTableActionCellClassName(isEditing: boolean): string {
  return isEditing ? TABLE_ACTION_CELL_EDITING_CLASS : TABLE_ACTION_CELL_CLASS;
}

function patchDraftById<T extends DraftWithId>(
  drafts: T[],
  draftId: string,
  patch: Partial<T>,
): T[] {
  return drafts.map(function mapDraft(draft) {
    if (draft.id !== draftId) {
      return draft;
    }
    return {
      ...draft,
      ...patch,
    };
  });
}

function removeDraftById<T extends DraftWithId>(
  drafts: T[],
  draftId: string,
): T[] {
  return drafts.filter(function keepDraft(draft) {
    return draft.id !== draftId;
  });
}

function createFieldDraft(
  column = "",
  value = "",
  isNull = false,
): TableFieldDraft {
  return {
    id: createDraftId(),
    column,
    value,
    isNull,
  };
}

function createCreateTableColumnDraft(
  name = "",
  type = "text",
  nullable = true,
): CreateTableColumnDraft {
  return {
    id: createDraftId(),
    name,
    type,
    nullable,
  };
}

function createInsertFieldDrafts(
  columns: DatabaseTableColumn[],
): TableFieldDraft[] {
  return columns.map(function buildField(column) {
    return createFieldDraft(column.name, "", true);
  });
}

function getColumnIndex(columns: string[], name: string): number {
  return columns.indexOf(name);
}

function findColumn(
  columns: DatabaseTableColumn[],
  columnName: string,
): DatabaseTableColumn | undefined {
  return columns.find(function matchColumn(column) {
    return column.name === columnName;
  });
}

function syncFieldDraftsWithColumns(
  fields: TableFieldDraft[],
  columns: DatabaseTableColumn[],
  fallbackToFirst: boolean,
): TableFieldDraft[] {
  if (columns.length === 0) {
    return [];
  }

  const allowed = new Set(
    columns.map(function getName(column) {
      return column.name;
    }),
  );

  const filtered = fields.filter(function keepField(field) {
    return allowed.has(field.column);
  });

  if (filtered.length > 0) {
    return filtered;
  }

  if (!fallbackToFirst) {
    return [];
  }

  return [createFieldDraft(columns[0].name)];
}

function toTypedSqlLiteral(
  field: TableFieldDraft,
  column: DatabaseTableColumn,
): string {
  if (field.isNull) {
    return "NULL";
  }

  const dataType = column.dataType.toLowerCase();
  const rawValue = field.value;
  const trimmed = rawValue.trim();

  if (BOOLEAN_TYPES.has(dataType)) {
    if (["true", "t", "1", "yes", "y"].includes(trimmed.toLowerCase())) {
      return "TRUE";
    }
    if (["false", "f", "0", "no", "n"].includes(trimmed.toLowerCase())) {
      return "FALSE";
    }
    throw new Error(`${column.name} expects boolean (true/false)`);
  }

  if (INTEGER_TYPES.has(dataType)) {
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`${column.name} expects integer`);
    }
    return trimmed;
  }

  if (NUMBER_TYPES.has(dataType)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${column.name} expects number`);
    }
    return trimmed;
  }

  if (JSON_TYPES.has(dataType)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      throw new Error(`${column.name} expects valid JSON`);
    }
    return `'${escapeSqlString(JSON.stringify(parsed))}'::${dataType}`;
  }

  return `'${escapeSqlString(rawValue)}'`;
}

function buildSqlFromFieldDrafts(
  fields: TableFieldDraft[],
  columns: DatabaseTableColumn[],
): { columnsSql: string; valuesSql: string; setSql: string } {
  const validFields = fields.filter(function hasColumn(field) {
    return field.column.trim().length > 0;
  });

  if (validFields.length === 0) {
    throw new Error("Add at least one field");
  }

  const seen = new Set<string>();
  const prepared = validFields.map(function prepare(field) {
    if (seen.has(field.column)) {
      throw new Error(`Duplicate column: ${field.column}`);
    }
    seen.add(field.column);

    const column = findColumn(columns, field.column);
    if (!column) {
      throw new Error(`Unknown column: ${field.column}`);
    }

    return {
      column,
      sqlValue: toTypedSqlLiteral(field, column),
    };
  });

  const columnsSql = prepared
    .map(function getColumnSql(item) {
      return quoteSqlIdentifier(item.column.name);
    })
    .join(", ");

  const valuesSql = prepared
    .map(function getValueSql(item) {
      return item.sqlValue;
    })
    .join(", ");

  const setSql = prepared
    .map(function getSetSql(item) {
      return `${quoteSqlIdentifier(item.column.name)} = ${item.sqlValue}`;
    })
    .join(", ");

  return {
    columnsSql,
    valuesSql,
    setSql,
  };
}

function parseTables(result: DatabaseTargetSqlResult): DatabaseTableItem[] {
  const schemaIndex = getColumnIndex(result.columns, "table_schema");
  const tableIndex = getColumnIndex(result.columns, "table_name");
  if (schemaIndex === -1 || tableIndex === -1) {
    return [];
  }

  const tables: DatabaseTableItem[] = [];
  for (const row of result.rows) {
    const schema = row[schemaIndex] ?? "";
    const name = row[tableIndex] ?? "";
    if (schema.length === 0 || name.length === 0) {
      continue;
    }
    tables.push({
      key: `${schema}::${name}`,
      schema,
      name,
    });
  }
  return tables;
}

function parseColumns(result: DatabaseTargetSqlResult): DatabaseTableColumn[] {
  const nameIndex = getColumnIndex(result.columns, "column_name");
  const typeIndex = getColumnIndex(result.columns, "data_type");
  if (nameIndex === -1 || typeIndex === -1) {
    return [];
  }

  const columns: DatabaseTableColumn[] = [];
  for (const row of result.rows) {
    const name = row[nameIndex] ?? "";
    const dataType = row[typeIndex] ?? "";
    if (name.length === 0) {
      continue;
    }
    columns.push({
      name,
      dataType,
    });
  }
  return columns;
}

function parseRows(result: DatabaseTargetSqlResult): DatabaseTableRow[] {
  const ctidIndex = getColumnIndex(result.columns, TABLE_ROW_ID_COLUMN);
  if (ctidIndex === -1) {
    return [];
  }

  const rows: DatabaseTableRow[] = [];
  for (const row of result.rows) {
    const ctid = row[ctidIndex] ?? "";
    if (ctid.length === 0) {
      continue;
    }
    const values: Record<string, string> = {};
    for (let i = 0; i < result.columns.length; i += 1) {
      const columnName = result.columns[i];
      if (columnName === TABLE_ROW_ID_COLUMN) {
        continue;
      }
      values[columnName] = row[i] ?? "";
    }
    rows.push({
      ctid,
      values,
    });
  }
  return rows;
}

function parseTotalRows(result: DatabaseTargetSqlResult): number {
  const totalRowsIndex = getColumnIndex(
    result.columns,
    TABLE_TOTAL_ROWS_COLUMN,
  );
  if (totalRowsIndex === -1 || result.rows.length === 0) {
    return 0;
  }

  const rawValue = result.rows[0][totalRowsIndex] ?? "0";
  const totalRows = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(totalRows) || totalRows < 0) {
    return 0;
  }

  return totalRows;
}

function TableFieldEditor({
  fields,
  columns,
  disabled,
  addLabel,
  emptyLabel,
  allowColumnChange = true,
  allowAddRemove = true,
  onAddField,
  onChangeField,
  onRemoveField,
}: TableFieldEditorProps) {
  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-800 px-2 py-3 text-xs text-neutral-500">
          {emptyLabel}
        </div>
      ) : (
        fields.map(function renderField(field) {
          const column = findColumn(columns, field.column);
          return (
            <div
              key={field.id}
              className="grid gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 p-2 md:grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)_auto_auto]"
            >
              {allowColumnChange ? (
                <select
                  value={field.column}
                  onChange={(event) =>
                    onChangeField(field.id, {
                      column: event.target.value,
                    })
                  }
                  className="h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus:border-neutral-500"
                  disabled={disabled}
                >
                  {columns.map(function renderColumnOption(option) {
                    return (
                      <option key={option.name} value={option.name}>
                        {option.name}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="inline-flex h-8 items-center rounded-md border border-neutral-700 bg-neutral-900 px-2 font-mono text-xs text-neutral-200">
                  {field.column}
                </div>
              )}

              <Input
                value={field.value}
                onChange={(event) =>
                  onChangeField(field.id, {
                    value: event.target.value,
                  })
                }
                placeholder={column?.dataType ?? "value"}
                className="h-8 border-neutral-700 bg-neutral-900 font-mono text-xs"
                disabled={disabled || field.isNull}
              />

              <label className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-700 px-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={field.isNull}
                  onChange={(event) =>
                    onChangeField(field.id, {
                      isNull: event.target.checked,
                    })
                  }
                  disabled={disabled}
                />
                null
              </label>

              {allowAddRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onRemoveField?.(field.id)}
                  disabled={disabled || !onRemoveField}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <div />
              )}
            </div>
          );
        })
      )}

      {allowAddRemove && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onAddField?.()}
          disabled={disabled || columns.length === 0 || !onAddField}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {addLabel ?? "Add field"}
        </Button>
      )}
    </div>
  );
}

export function DatabaseTableBrowser({
  databaseId,
  targetId,
  branchName,
  isBranchActive,
}: DatabaseTableBrowserProps) {
  const runSqlMutation = useRunDatabaseTargetSql(databaseId, targetId);
  const runSqlAsyncRef = useRef(runSqlMutation.mutateAsync);
  const [tables, setTables] = useState<DatabaseTableItem[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [columns, setColumns] = useState<DatabaseTableColumn[]>([]);
  const [rows, setRows] = useState<DatabaseTableRow[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZE);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] =
    useState<DatabaseTableSortDirection | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [createTableName, setCreateTableName] = useState("");
  const [createColumns, setCreateColumns] = useState<CreateTableColumnDraft[]>([
    createCreateTableColumnDraft(),
  ]);
  const [insertFields, setInsertFields] = useState<TableFieldDraft[]>([]);
  const [isCreateTableDialogOpen, setIsCreateTableDialogOpen] = useState(false);
  const [isInsertDialogOpen, setIsInsertDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [editRowCtid, setEditRowCtid] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<TableFieldDraft[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isWaitingForTableData, setIsWaitingForTableData] = useState(false);
  const [metadataReloadKey, setMetadataReloadKey] = useState(0);
  const [tableDataReloadKey, setTableDataReloadKey] = useState(0);
  const [showTableScrollLeftFade, setShowTableScrollLeftFade] = useState(false);
  const [showTableScrollRightFade, setShowTableScrollRightFade] =
    useState(false);
  const columnsRef = useRef<DatabaseTableColumn[]>([]);
  const totalRowsRef = useRef(0);
  const tableDataRequestIdRef = useRef(0);
  const lastMetadataTableKeyRef = useRef<string | null>(null);
  const lastMetadataReloadKeyRef = useRef(0);
  const tableScrollAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedTable = useMemo(
    function findSelectedTable() {
      return (
        tables.find(function findTable(table) {
          return table.key === selectedTableKey;
        }) ?? null
      );
    },
    [tables, selectedTableKey],
  );

  const visibleTables = useMemo(
    function filterTables() {
      const query = search.trim().toLowerCase();
      if (query.length === 0) {
        return tables;
      }
      return tables.filter(function matches(table) {
        return `${table.schema}.${table.name}`.toLowerCase().includes(query);
      });
    },
    [tables, search],
  );

  const columnMetaByName = useMemo(
    function buildColumnMetaByName() {
      return new Map(
        columns.map(function toEntry(column) {
          return [column.name, column] as const;
        }),
      );
    },
    [columns],
  );

  const dataColumns = useMemo(
    function buildDataColumns() {
      if (columns.length > 0) {
        return columns.map(function getColumnName(column) {
          return column.name;
        });
      }
      if (rows.length === 0) {
        return [];
      }
      return Object.keys(rows[0].values);
    },
    [columns, rows],
  );

  const pageCount = useMemo(
    function buildPageCount() {
      return getTablePageCount(totalRows, pageSize);
    },
    [totalRows, pageSize],
  );

  const pageStartRow =
    totalRows === 0 ? 0 : Math.min(totalRows, page * pageSize + 1);
  const pageEndRow =
    totalRows === 0 ? 0 : Math.min(totalRows, page * pageSize + rows.length);
  const canGoToPreviousPage = page > 0;
  const canGoToNextPage = page < pageCount - 1;
  const isBusy = runSqlMutation.isPending || isLoadingTables || isLoadingRows;
  const shouldShowTableLoadingState =
    !!selectedTable && dataColumns.length === 0 && isWaitingForTableData;

  useEffect(
    function syncRunSqlAsyncRef() {
      runSqlAsyncRef.current = runSqlMutation.mutateAsync;
    },
    [runSqlMutation.mutateAsync],
  );

  const runSql = useCallback(async function runSql(
    sql: string,
  ): Promise<DatabaseTargetSqlResult> {
    return runSqlAsyncRef.current({ sql });
  }, []);

  const updateTableScrollFades = useCallback(function updateTableScrollFades() {
    const node = tableScrollAreaRef.current;
    if (!node) {
      setShowTableScrollLeftFade(false);
      setShowTableScrollRightFade(false);
      return;
    }

    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    setShowTableScrollLeftFade(node.scrollLeft > TABLE_SCROLL_FADE_THRESHOLD);
    setShowTableScrollRightFade(
      maxScrollLeft > TABLE_SCROLL_FADE_THRESHOLD &&
        node.scrollLeft < maxScrollLeft - TABLE_SCROLL_FADE_THRESHOLD,
    );
  }, []);

  const handleTableScroll = useCallback(
    function handleTableScroll() {
      updateTableScrollFades();
    },
    [updateTableScrollFades],
  );

  useEffect(
    function syncTableDataRefs() {
      columnsRef.current = columns;
      totalRowsRef.current = totalRows;
    },
    [columns, totalRows],
  );

  const resetActiveTableView = useCallback(function resetActiveTableView() {
    setColumns([]);
    setRows([]);
    setPage(0);
    setSortColumn(null);
    setSortDirection(null);
    setTotalRows(0);
    setInsertFields([]);
    setIsInsertDialogOpen(false);
    setIsUpdateDialogOpen(false);
    setEditFields([]);
    setEditRowCtid(null);
    setIsWaitingForTableData(false);
    columnsRef.current = [];
    totalRowsRef.current = 0;
    lastMetadataTableKeyRef.current = null;
    lastMetadataReloadKeyRef.current = 0;
    setShowTableScrollLeftFade(false);
    setShowTableScrollRightFade(false);
  }, []);

  useEffect(
    function syncTableScrollFades() {
      if (!selectedTable || dataColumns.length === 0) {
        setShowTableScrollLeftFade(false);
        setShowTableScrollRightFade(false);
        return;
      }

      const frameId = window.requestAnimationFrame(updateTableScrollFades);
      return function cleanup() {
        window.cancelAnimationFrame(frameId);
      };
    },
    [dataColumns.length, selectedTable, updateTableScrollFades],
  );

  useEffect(
    function observeTableScrollAreaSize() {
      if (!selectedTable || dataColumns.length === 0) {
        return;
      }

      const node = tableScrollAreaRef.current;
      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(function handleResize() {
        updateTableScrollFades();
      });
      observer.observe(node);

      const contentNode = node.firstElementChild;
      if (contentNode instanceof HTMLElement) {
        observer.observe(contentNode);
      }

      return function cleanup() {
        observer.disconnect();
      };
    },
    [dataColumns.length, selectedTable, updateTableScrollFades],
  );

  const selectTableKey = useCallback(
    function selectTableKey(nextTableKey: string) {
      if (nextTableKey === selectedTableKey) {
        return;
      }
      resetActiveTableView();
      setErrorText(null);
      setIsWaitingForTableData(true);
      setSelectedTableKey(nextTableKey);
    },
    [resetActiveTableView, selectedTableKey],
  );

  const loadTables = useCallback(
    async function loadTables(options?: {
      preferredSelectedTableKey?: string;
      reloadSelectedTableData?: boolean;
    }) {
      setIsLoadingTables(true);
      setErrorText(null);
      try {
        const result = await runSql(`
          select table_schema, table_name
          from information_schema.tables
          where table_type = 'BASE TABLE'
            and table_schema not in ('pg_catalog', 'information_schema')
          order by table_schema, table_name;
        `);
        const nextTables = parseTables(result);
        setTables(nextTables);
        if (nextTables.length === 0) {
          resetActiveTableView();
          setSelectedTableKey(null);
          return;
        }

        const preferredSelectedTableKey =
          options?.preferredSelectedTableKey ?? selectedTableKey;
        const hasPreferredSelection = nextTables.some(function hasTable(table) {
          return table.key === preferredSelectedTableKey;
        });
        const nextSelectedTableKey = hasPreferredSelection
          ? (preferredSelectedTableKey ?? nextTables[0].key)
          : nextTables[0].key;

        if (nextSelectedTableKey !== selectedTableKey) {
          selectTableKey(nextSelectedTableKey);
        } else if (options?.reloadSelectedTableData) {
          setMetadataReloadKey(function incrementReloadKey(current) {
            return current + 1;
          });
        }
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load tables");
        setErrorText(message);
      } finally {
        setIsLoadingTables(false);
      }
    },
    [resetActiveTableView, runSql, selectTableKey, selectedTableKey],
  );

  const loadSelectedTableData = useCallback(
    async function loadSelectedTableData(
      table: DatabaseTableItem,
      options: LoadSelectedTableDataOptions,
    ) {
      const requestId = tableDataRequestIdRef.current + 1;
      tableDataRequestIdRef.current = requestId;
      setIsWaitingForTableData(true);
      setIsLoadingRows(true);
      setErrorText(null);
      try {
        let nextColumns = columnsRef.current;
        let nextTotalRows = totalRowsRef.current;
        let nextSortColumn = options.sortColumn;
        let nextSortDirection = options.sortDirection;

        if (options.reloadMetadata) {
          const safeSchema = escapeSqlString(table.schema);
          const safeTable = escapeSqlString(table.name);

          const columnsResult = await runSql(`
            select column_name, data_type
            from information_schema.columns
            where table_schema = '${safeSchema}'
              and table_name = '${safeTable}'
            order by ordinal_position;
          `);
          if (requestId !== tableDataRequestIdRef.current) {
            return;
          }

          nextColumns = parseColumns(columnsResult);

          const totalRowsResult = await runSql(buildTableCountQuery(table));
          if (requestId !== tableDataRequestIdRef.current) {
            return;
          }

          nextTotalRows = parseTotalRows(totalRowsResult);

          if (
            nextSortColumn &&
            !nextColumns.some(function hasColumn(column) {
              return column.name === nextSortColumn;
            })
          ) {
            nextSortColumn = null;
            nextSortDirection = null;
          }
        }

        const nextPage = clampTablePage(
          options.page,
          nextTotalRows,
          options.pageSize,
        );
        const rowsResult = await runSql(
          buildTableRowsQuery({
            table,
            page: nextPage,
            pageSize: options.pageSize,
            sortColumn: nextSortColumn,
            sortDirection: nextSortDirection,
          }),
        );
        if (requestId !== tableDataRequestIdRef.current) {
          return;
        }

        if (options.reloadMetadata) {
          columnsRef.current = nextColumns;
          totalRowsRef.current = nextTotalRows;
          setColumns(nextColumns);
          setInsertFields(createInsertFieldDrafts(nextColumns));
          setEditFields(function syncEditFields(current) {
            return syncFieldDraftsWithColumns(current, nextColumns, false);
          });
          setTotalRows(nextTotalRows);
          lastMetadataTableKeyRef.current = table.key;
          lastMetadataReloadKeyRef.current = options.metadataReloadKey;

          if (nextSortColumn !== options.sortColumn) {
            setSortColumn(nextSortColumn);
          }
          if (nextSortDirection !== options.sortDirection) {
            setSortDirection(nextSortDirection);
          }
        }

        setRows(parseRows(rowsResult));
        setEditRowCtid(null);

        if (nextPage !== options.page) {
          setPage(nextPage);
        }
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load table data");
        setErrorText(message);
      } finally {
        if (requestId === tableDataRequestIdRef.current) {
          setIsWaitingForTableData(false);
          setIsLoadingRows(false);
        }
      }
    },
    [runSql],
  );

  useEffect(
    function loadWhenTargetChanges() {
      if (!targetId || !isBranchActive) {
        setTables([]);
        resetActiveTableView();
        setSelectedTableKey(null);
        setErrorText(null);
        setCreateTableName("");
        setCreateColumns([createCreateTableColumnDraft()]);
        setIsCreateTableDialogOpen(false);
        return;
      }
      void loadTables();
    },
    [isBranchActive, loadTables, resetActiveTableView, targetId],
  );

  useEffect(
    function loadWhenTableDataChanges() {
      if (!selectedTable || !isBranchActive) {
        columnsRef.current = [];
        totalRowsRef.current = 0;
        setColumns([]);
        setRows([]);
        setTotalRows(0);
        setInsertFields([]);
        setIsInsertDialogOpen(false);
        setIsUpdateDialogOpen(false);
        setEditFields([]);
        setEditRowCtid(null);
        return;
      }

      const shouldReloadMetadata =
        lastMetadataTableKeyRef.current !== selectedTable.key ||
        lastMetadataReloadKeyRef.current !== metadataReloadKey;

      void loadSelectedTableData(selectedTable, {
        page,
        pageSize,
        sortColumn,
        sortDirection,
        reloadMetadata: shouldReloadMetadata,
        metadataReloadKey,
        tableDataReloadKey,
      });
    },
    [
      isBranchActive,
      loadSelectedTableData,
      metadataReloadKey,
      page,
      pageSize,
      selectedTable,
      sortColumn,
      sortDirection,
      tableDataReloadKey,
    ],
  );

  function handleAddCreateColumn() {
    setCreateColumns(function addCreateColumn(current) {
      return [...current, createCreateTableColumnDraft()];
    });
  }

  function handleChangeCreateColumn(
    columnId: string,
    patch: Partial<CreateTableColumnDraft>,
  ) {
    setCreateColumns(function updateCreateColumn(current) {
      return patchDraftById(current, columnId, patch);
    });
  }

  function handleRemoveCreateColumn(columnId: string) {
    setCreateColumns(function removeCreateColumn(current) {
      return removeDraftById(current, columnId);
    });
  }

  function openCreateTableDialog() {
    setErrorText(null);
    if (createColumns.length === 0) {
      setCreateColumns([createCreateTableColumnDraft()]);
    }
    setIsCreateTableDialogOpen(true);
  }

  function openInsertDialog() {
    if (!selectedTable) {
      return;
    }
    setErrorText(null);
    setInsertFields(createInsertFieldDrafts(columns));
    setIsInsertDialogOpen(true);
  }

  function handleCreateTableDialogOpenChange(open: boolean) {
    setIsCreateTableDialogOpen(open);
  }

  function handleInsertDialogOpenChange(open: boolean) {
    setIsInsertDialogOpen(open);
  }

  function handleUpdateDialogOpenChange(open: boolean) {
    setIsUpdateDialogOpen(open);
    if (!open) {
      setEditRowCtid(null);
      setEditFields([]);
    }
  }

  function handleCreateTableFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCreateTable();
  }

  function handleInsertFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleInsertRecord();
  }

  function handleUpdateFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSaveRowEdit();
  }

  async function handleCreateTable() {
    const tableName = createTableName.trim();
    if (tableName.length === 0) {
      setErrorText("Table name is required");
      return;
    }
    if (!SQL_IDENTIFIER_PATTERN.test(tableName)) {
      setErrorText(
        "Table name must use lowercase letters, numbers, underscore",
      );
      return;
    }

    const validColumns = createColumns
      .map(function sanitizeColumn(column) {
        return {
          ...column,
          name: column.name.trim(),
        };
      })
      .filter(function filterColumn(column) {
        return column.name.length > 0;
      });

    if (validColumns.length === 0) {
      setErrorText("Add at least one column");
      return;
    }

    for (const column of validColumns) {
      if (!SQL_IDENTIFIER_PATTERN.test(column.name)) {
        setErrorText(
          `Invalid column name: ${column.name}. Use lowercase letters, numbers, underscore`,
        );
        return;
      }
    }

    const duplicateNames = new Set<string>();
    for (const column of validColumns) {
      if (duplicateNames.has(column.name)) {
        setErrorText(`Duplicate column: ${column.name}`);
        return;
      }
      duplicateNames.add(column.name);
    }

    const columnsSql = validColumns
      .map(function buildColumnSql(column) {
        const nullableSql = column.nullable ? "" : " not null";
        return `${quoteSqlIdentifier(column.name)} ${column.type}${nullableSql}`;
      })
      .join(", ");

    try {
      setErrorText(null);
      await runSql(
        `create table ${quoteSqlIdentifier("public")}.${quoteSqlIdentifier(tableName)} (${columnsSql});`,
      );
      toast.success(`Table ${tableName} created`);
      setCreateTableName("");
      setCreateColumns([createCreateTableColumnDraft()]);
      setIsCreateTableDialogOpen(false);
      await loadTables({
        preferredSelectedTableKey: `public::${tableName}`,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create table");
      setErrorText(message);
      toast.error(message);
    }
  }

  function handleChangeInsertField(
    fieldId: string,
    patch: Partial<TableFieldDraft>,
  ) {
    setInsertFields(function updateField(current) {
      return patchDraftById(current, fieldId, patch);
    });
  }

  function handleAddEditField() {
    if (columns.length === 0 || editRowCtid === null) {
      return;
    }
    setEditFields(function addField(current) {
      return [...current, createFieldDraft(columns[0].name)];
    });
  }

  function handleChangeEditField(
    fieldId: string,
    patch: Partial<TableFieldDraft>,
  ) {
    setEditFields(function updateField(current) {
      return patchDraftById(current, fieldId, patch);
    });
  }

  function handleRemoveEditField(fieldId: string) {
    setEditFields(function removeField(current) {
      return removeDraftById(current, fieldId);
    });
  }

  function handleSort(columnName: string) {
    const nextSortState = getNextTableSortState(
      {
        sortColumn,
        sortDirection,
      },
      columnName,
    );
    setPage(0);
    setSortColumn(nextSortState.sortColumn);
    setSortDirection(nextSortState.sortDirection);
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize = Number.parseInt(value, 10);
    if (!TABLE_PAGE_SIZE_OPTIONS.includes(nextPageSize as 25 | 50 | 100)) {
      return;
    }
    setPage(0);
    setPageSize(nextPageSize);
  }

  function handleGoToPreviousPage() {
    setPage(function goToPreviousPage(current) {
      return Math.max(0, current - 1);
    });
  }

  function handleGoToNextPage() {
    setPage(function goToNextPage(current) {
      return Math.min(pageCount - 1, current + 1);
    });
  }

  function openEditRow(row: DatabaseTableRow) {
    const nextFields = dataColumns.map(function buildField(columnName) {
      const value = row.values[columnName] ?? "";
      const isNull = value === "NULL";
      return createFieldDraft(columnName, isNull ? "" : value, isNull);
    });
    setEditRowCtid(row.ctid);
    setEditFields(nextFields);
    setErrorText(null);
    setIsUpdateDialogOpen(true);
  }

  async function handleInsertRecord() {
    if (!selectedTable) {
      return;
    }
    try {
      const tableIdentifier = getDatabaseTableIdentifier(selectedTable);
      const sqlParts = buildSqlFromFieldDrafts(insertFields, columns);
      await runSql(
        `insert into ${tableIdentifier} (${sqlParts.columnsSql}) values (${sqlParts.valuesSql});`,
      );
      toast.success("Record inserted");
      setInsertFields(function clearValues(current) {
        return current.map(function clearField(field) {
          return {
            ...field,
            value: "",
            isNull: false,
          };
        });
      });
      setIsInsertDialogOpen(false);
      setMetadataReloadKey(function incrementReloadKey(current) {
        return current + 1;
      });
    } catch (error) {
      const message = getErrorMessage(error, "Insert failed");
      setErrorText(message);
      toast.error(message);
    }
  }

  async function handleSaveRowEdit() {
    if (!selectedTable || !editRowCtid) {
      return;
    }
    try {
      const tableIdentifier = getDatabaseTableIdentifier(selectedTable);
      const sqlParts = buildSqlFromFieldDrafts(editFields, columns);
      await runSql(
        `update ${tableIdentifier} set ${sqlParts.setSql} where ctid = '${escapeSqlString(editRowCtid)}'::tid;`,
      );
      toast.success("Row updated");
      setEditRowCtid(null);
      setEditFields([]);
      setIsUpdateDialogOpen(false);
      setTableDataReloadKey(function incrementReloadKey(current) {
        return current + 1;
      });
    } catch (error) {
      const message = getErrorMessage(error, "Update failed");
      setErrorText(message);
      toast.error(message);
    }
  }

  async function handleDeleteRow(row: DatabaseTableRow) {
    if (!selectedTable) {
      return;
    }
    if (!window.confirm("Delete this row?")) {
      return;
    }
    try {
      const tableIdentifier = getDatabaseTableIdentifier(selectedTable);
      await runSql(
        `delete from ${tableIdentifier} where ctid = '${escapeSqlString(row.ctid)}'::tid;`,
      );
      toast.success("Row deleted");
      if (editRowCtid === row.ctid) {
        setIsUpdateDialogOpen(false);
        setEditRowCtid(null);
        setEditFields([]);
      }
      setMetadataReloadKey(function incrementReloadKey(current) {
        return current + 1;
      });
    } catch (error) {
      const message = getErrorMessage(error, "Delete failed");
      setErrorText(message);
      toast.error(message);
    }
  }

  async function handleRefresh() {
    await loadTables({
      reloadSelectedTableData: true,
    });
  }

  if (!isBranchActive) {
    return (
      <Card className="border-neutral-800 bg-neutral-900">
        <CardContent className="p-6 text-sm text-neutral-400">
          Start this branch to browse tables.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 w-full flex-1 gap-4 overflow-hidden">
        <Card className="w-72 min-h-0 border-neutral-800 bg-neutral-900">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="space-y-3 border-b border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-neutral-200">
                  <Table2 className="h-4 w-4 text-neutral-400" />
                  Tables
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={openCreateTableDialog}
                    disabled={isBusy}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      void handleRefresh();
                    }}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tables"
                className="border-neutral-700 bg-neutral-950"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {visibleTables.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-800 px-3 py-6 text-center text-xs text-neutral-500">
                  No tables found.
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleTables.map(function renderTable(table) {
                    const selected = selectedTableKey === table.key;
                    return (
                      <button
                        type="button"
                        key={table.key}
                        onClick={() => {
                          selectTableKey(table.key);
                        }}
                        className={
                          selected
                            ? "w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-2 text-left"
                            : "w-full rounded-md border border-transparent px-2 py-2 text-left hover:border-neutral-800 hover:bg-neutral-800/60"
                        }
                      >
                        <div className="text-sm text-neutral-200">
                          {table.name}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {table.schema}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 min-w-0 flex-1 border-neutral-800 bg-neutral-900">
          <CardContent className="flex h-full min-h-0 min-w-0 flex-col p-0">
            <div className="space-y-3 border-b border-neutral-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {selectedTable ? (
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-neutral-400" />
                    <span className="font-mono text-sm text-neutral-100">
                      {selectedTable.schema}.{selectedTable.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-neutral-700 text-neutral-300"
                    >
                      {branchName}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400">
                    Select a table
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openInsertDialog}
                    disabled={isBusy || !selectedTable}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Insert record
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void handleRefresh();
                    }}
                    disabled={isBusy}
                  >
                    <RefreshCcw className="mr-1.5 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>

              {errorText && (
                <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {errorText}
                </div>
              )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {!selectedTable ? (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                  Pick a table from the left.
                </div>
              ) : shouldShowTableLoadingState ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading table...
                </div>
              ) : dataColumns.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                  No columns found.
                </div>
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="relative min-h-0 min-w-0 flex-1">
                    <div
                      ref={tableScrollAreaRef}
                      onScroll={handleTableScroll}
                      className="h-full min-h-0 min-w-0 overflow-auto"
                    >
                      <div className="min-w-max">
                        <table className="min-w-full text-left">
                          <thead className="sticky top-0 z-20 bg-neutral-900">
                            <tr className="border-b border-neutral-800">
                              {dataColumns.map(
                                function renderColumn(columnName) {
                                  const meta = columnMetaByName.get(columnName);
                                  const isSorted = sortColumn === columnName;
                                  return (
                                    <th
                                      key={columnName}
                                      className="min-w-56 px-3 py-2 text-xs font-medium text-neutral-400"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleSort(columnName)}
                                        disabled={isBusy}
                                        className="flex w-full items-start justify-between gap-3 text-left"
                                      >
                                        <span className="space-y-0.5">
                                          <div>{columnName}</div>
                                          {meta && (
                                            <div className="font-normal text-[10px] uppercase tracking-wide text-neutral-600">
                                              {meta.dataType}
                                            </div>
                                          )}
                                        </span>
                                        {isSorted ? (
                                          sortDirection === "asc" ? (
                                            <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300" />
                                          ) : (
                                            <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300" />
                                          )
                                        ) : (
                                          <ArrowUpDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
                                        )}
                                      </button>
                                    </th>
                                  );
                                },
                              )}
                              <th className={TABLE_ACTION_HEADER_CLASS}>
                                actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={dataColumns.length + 1}
                                  className="px-3 py-8 text-center text-sm text-neutral-500"
                                >
                                  No rows.
                                </td>
                              </tr>
                            ) : (
                              rows.map(function renderRow(row) {
                                const isEditing = editRowCtid === row.ctid;
                                return (
                                  <tr
                                    key={row.ctid}
                                    className={
                                      isEditing
                                        ? "group border-b border-neutral-800 bg-neutral-800/60"
                                        : "group border-b border-neutral-800 hover:bg-neutral-800/30"
                                    }
                                  >
                                    {dataColumns.map(
                                      function renderCell(columnName) {
                                        const value =
                                          row.values[columnName] ?? "";
                                        return (
                                          <td
                                            key={`${row.ctid}-${columnName}`}
                                            className="min-w-56 max-w-80 px-3 py-2 align-top font-mono text-xs text-neutral-200"
                                          >
                                            <div className="truncate">
                                              {value === "NULL" ? (
                                                <span className="text-neutral-500">
                                                  NULL
                                                </span>
                                              ) : value.length === 0 ? (
                                                <span className="text-neutral-600">
                                                  ""
                                                </span>
                                              ) : (
                                                value
                                              )}
                                            </div>
                                          </td>
                                        );
                                      },
                                    )}
                                    <td
                                      className={getTableActionCellClassName(
                                        isEditing,
                                      )}
                                    >
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => openEditRow(row)}
                                          disabled={isBusy}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-red-300 hover:text-red-200"
                                          onClick={() => {
                                            void handleDeleteRow(row);
                                          }}
                                          disabled={isBusy}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div
                      className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-neutral-900 to-transparent transition-opacity duration-200 ${
                        showTableScrollLeftFade ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div
                      className={`pointer-events-none absolute inset-y-0 right-28 z-10 w-14 bg-gradient-to-r from-transparent to-[rgb(20,20,20)] transition-opacity duration-200 ${
                        showTableScrollRightFade ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </div>

                  <div className="sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2 backdrop-blur">
                    <div className="text-xs text-neutral-500">
                      {totalRows === 0
                        ? "0 rows"
                        : `${pageStartRow}-${pageEndRow} of ${totalRows} rows`}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-neutral-500">
                        Rows/page
                      </span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={handlePageSizeChange}
                      >
                        <SelectTrigger
                          className="h-8 w-20 border-neutral-700 bg-neutral-900 text-xs text-neutral-200"
                          disabled={isBusy}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TABLE_PAGE_SIZE_OPTIONS.map(
                            function renderPageSize(option) {
                              return (
                                <SelectItem key={option} value={String(option)}>
                                  {option}
                                </SelectItem>
                              );
                            },
                          )}
                        </SelectContent>
                      </Select>

                      <span className="text-xs text-neutral-500">
                        Page {page + 1} of {pageCount}
                      </span>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGoToPreviousPage}
                        disabled={!canGoToPreviousPage || isBusy}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGoToNextPage}
                        disabled={!canGoToNextPage || isBusy}
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isCreateTableDialogOpen}
        onOpenChange={handleCreateTableDialogOpenChange}
      >
        <DialogContent className="z-[80] max-h-[85vh] overflow-y-auto border-neutral-800 bg-neutral-900 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create table</DialogTitle>
            <DialogDescription>
              Create a new table in the public schema.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTableFormSubmit} className="space-y-4">
            <div className="space-y-3">
              <Input
                value={createTableName}
                onChange={(event) => setCreateTableName(event.target.value)}
                placeholder="table_name"
                className="h-9 border-neutral-700 bg-neutral-900 font-mono text-sm"
                disabled={isBusy}
              />

              <div className="space-y-2">
                {createColumns.length === 0 ? (
                  <div className="rounded-md border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
                    No columns. Add one.
                  </div>
                ) : (
                  createColumns.map(function renderCreateColumn(column) {
                    return (
                      <div
                        key={column.id}
                        className="grid gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 p-2 md:grid-cols-[minmax(140px,2fr)_minmax(120px,1fr)_auto_auto]"
                      >
                        <Input
                          value={column.name}
                          onChange={(event) =>
                            handleChangeCreateColumn(column.id, {
                              name: event.target.value,
                            })
                          }
                          placeholder="column_name"
                          className="h-8 border-neutral-700 bg-neutral-900 font-mono text-xs"
                          disabled={isBusy}
                        />

                        <select
                          value={column.type}
                          onChange={(event) =>
                            handleChangeCreateColumn(column.id, {
                              type: event.target.value,
                            })
                          }
                          className="h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus:border-neutral-500"
                          disabled={isBusy}
                        >
                          {CREATE_COLUMN_TYPE_OPTIONS.map(
                            function renderType(type) {
                              return (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              );
                            },
                          )}
                        </select>

                        <label className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-700 px-2 text-xs text-neutral-400">
                          <input
                            type="checkbox"
                            checked={column.nullable}
                            onChange={(event) =>
                              handleChangeCreateColumn(column.id, {
                                nullable: event.target.checked,
                              })
                            }
                            disabled={isBusy}
                          />
                          null
                        </label>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemoveCreateColumn(column.id)}
                          disabled={isBusy}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAddCreateColumn}
                disabled={isBusy}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add column
              </Button>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateTableDialogOpen(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                Create table
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isInsertDialogOpen}
        onOpenChange={handleInsertDialogOpenChange}
      >
        <DialogContent className="z-[80] max-h-[85vh] overflow-y-auto border-neutral-800 bg-neutral-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Insert record</DialogTitle>
            <DialogDescription>
              {selectedTable
                ? `Insert into ${selectedTable.schema}.${selectedTable.name}.`
                : "Select a table first."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInsertFormSubmit} className="space-y-4">
            {selectedTable ? (
              <TableFieldEditor
                fields={insertFields}
                columns={columns}
                disabled={isBusy}
                allowColumnChange={false}
                allowAddRemove={false}
                emptyLabel="No columns found."
                onChangeField={handleChangeInsertField}
              />
            ) : (
              <div className="rounded-md border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
                Select a table first.
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsInsertDialogOpen(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || !selectedTable}>
                Insert
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isUpdateDialogOpen}
        onOpenChange={handleUpdateDialogOpenChange}
      >
        <DialogContent className="z-[80] max-h-[85vh] overflow-y-auto border-neutral-800 bg-neutral-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update row</DialogTitle>
            <DialogDescription>
              {selectedTable
                ? `Update row in ${selectedTable.schema}.${selectedTable.name}.`
                : "Select a table first."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateFormSubmit} className="space-y-4">
            {editRowCtid ? (
              <div className="space-y-3">
                <Badge
                  variant="outline"
                  className="border-neutral-700 text-neutral-300"
                >
                  {editRowCtid}
                </Badge>
                <TableFieldEditor
                  fields={editFields}
                  columns={columns}
                  disabled={isBusy}
                  addLabel="Add field"
                  emptyLabel="No fields. Add one."
                  onAddField={handleAddEditField}
                  onChangeField={handleChangeEditField}
                  onRemoveField={handleRemoveEditField}
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
                Pick a row from the table first.
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleUpdateDialogOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || editRowCtid === null}>
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
