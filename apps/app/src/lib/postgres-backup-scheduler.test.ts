import { describe, expect, test } from "bun:test";
import { isPostgresBackupDue } from "./postgres-backup-scheduler";

describe("isPostgresBackupDue", () => {
  test("is due when never ran", () => {
    expect(
      isPostgresBackupDue({
        lastRunAt: null,
        intervalValue: 6,
        intervalUnit: "hours",
      }),
    ).toBe(true);
  });

  test("is not due before interval", () => {
    const now = Date.now();
    expect(
      isPostgresBackupDue({
        lastRunAt: now - 30 * 60 * 1000,
        intervalValue: 1,
        intervalUnit: "hours",
        now,
      }),
    ).toBe(false);
  });

  test("is due at interval", () => {
    const now = Date.now();
    expect(
      isPostgresBackupDue({
        lastRunAt: now - 60 * 60 * 1000,
        intervalValue: 1,
        intervalUnit: "hours",
        now,
      }),
    ).toBe(true);
  });
});
