import { describe, expect, test } from "bun:test";
import {
  formatProjectResourceBreakdown,
  getProjectResourceSummary,
  getProjectResourceSummaryTone,
} from "./project-resource-summary";

describe("getProjectResourceSummary", () => {
  test("counts services, databases, and object storage together", () => {
    const summary = getProjectResourceSummary({
      services: [
        { runtimeStatus: "online", attentionStatus: null },
        { runtimeStatus: "offline", attentionStatus: null },
      ],
      databases: [{ runtimeStatus: "online", attentionStatus: null }],
      objectStorages: [{ runtimeStatus: "online", attentionStatus: null }],
    });

    expect(summary).toEqual({
      serviceCount: 2,
      databaseCount: 1,
      objectStorageCount: 1,
      totalCount: 4,
      onlineCount: 3,
      attentionCount: 0,
    });
  });
});

describe("getProjectResourceSummaryTone", () => {
  test("returns success when everything is online", () => {
    expect(
      getProjectResourceSummaryTone({
        serviceCount: 1,
        databaseCount: 1,
        objectStorageCount: 0,
        totalCount: 2,
        onlineCount: 2,
        attentionCount: 0,
      }),
    ).toBe("success");
  });

  test("returns warning when only part of the project is online", () => {
    expect(
      getProjectResourceSummaryTone({
        serviceCount: 1,
        databaseCount: 1,
        objectStorageCount: 0,
        totalCount: 2,
        onlineCount: 1,
        attentionCount: 0,
      }),
    ).toBe("warning");
  });

  test("returns danger when nothing is online", () => {
    expect(
      getProjectResourceSummaryTone({
        serviceCount: 1,
        databaseCount: 1,
        objectStorageCount: 0,
        totalCount: 2,
        onlineCount: 0,
        attentionCount: 0,
      }),
    ).toBe("danger");
  });
});

describe("formatProjectResourceBreakdown", () => {
  test("formats services and databases", () => {
    expect(
      formatProjectResourceBreakdown({
        serviceCount: 1,
        databaseCount: 1,
        objectStorageCount: 1,
        totalCount: 3,
        onlineCount: 3,
        attentionCount: 0,
      }),
    ).toBe("1 service, 1 database, 1 object storage");
  });
});
