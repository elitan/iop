import { describe, expect, test } from "bun:test";
import {
  buildTableCountQuery,
  buildTableRowsQuery,
  clampTablePage,
  getNextTableSortState,
} from "./database-table-browser-queries";

describe("buildTableCountQuery", () => {
  test("builds a count query for the table", () => {
    expect(
      buildTableCountQuery({
        schema: "public",
        name: "users",
      }),
    ).toContain('from "public"."users"');
  });
});

describe("buildTableRowsQuery", () => {
  test("builds the default row query", () => {
    expect(
      buildTableRowsQuery({
        table: {
          schema: "public",
          name: "users",
        },
        page: 2,
        pageSize: 25,
        sortColumn: null,
        sortDirection: null,
      }),
    ).toContain("order by ctid asc");
  });

  test("builds the sorted row query", () => {
    const query = buildTableRowsQuery({
      table: {
        schema: "public",
        name: "users",
      },
      page: 1,
      pageSize: 50,
      sortColumn: "created_at",
      sortDirection: "desc",
    });

    expect(query).toContain('order by "created_at" desc nulls last, ctid asc');
    expect(query).toContain("limit 50");
    expect(query).toContain("offset 50");
  });

  test("quotes identifiers safely", () => {
    const query = buildTableRowsQuery({
      table: {
        schema: 'public"',
        name: 'weird"name',
      },
      page: 0,
      pageSize: 25,
      sortColumn: 'some"column',
      sortDirection: "asc",
    });

    expect(query).toContain('from "public"""."weird""name"');
    expect(query).toContain('order by "some""column" asc nulls last, ctid asc');
  });
});

describe("getNextTableSortState", () => {
  test("cycles through asc, desc, then default", () => {
    const first = getNextTableSortState(
      {
        sortColumn: null,
        sortDirection: null,
      },
      "created_at",
    );
    const second = getNextTableSortState(first, "created_at");
    const third = getNextTableSortState(second, "created_at");

    expect(first).toEqual({
      sortColumn: "created_at",
      sortDirection: "asc",
    });
    expect(second).toEqual({
      sortColumn: "created_at",
      sortDirection: "desc",
    });
    expect(third).toEqual({
      sortColumn: null,
      sortDirection: null,
    });
  });
});

describe("clampTablePage", () => {
  test("clamps the page when rows shrink", () => {
    expect(clampTablePage(4, 95, 25)).toBe(3);
    expect(clampTablePage(2, 0, 25)).toBe(0);
  });
});
