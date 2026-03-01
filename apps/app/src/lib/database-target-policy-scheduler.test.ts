import { describe, expect, test } from "bun:test";
import {
  isDatabaseTargetIdleDue,
  isDatabaseTargetTtlExpired,
} from "./database-target-policy-scheduler";

describe("isDatabaseTargetTtlExpired", function describeTtl() {
  test("returns false before ttl deadline", function testBeforeDeadline() {
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const now = createdAt + 2 * 60 * 60 * 1000;

    const expired = isDatabaseTargetTtlExpired({
      createdAt,
      ttlValue: 3,
      ttlUnit: "hours",
      now,
    });

    expect(expired).toBe(false);
  });

  test("returns true after ttl deadline", function testAfterDeadline() {
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const now = createdAt + 2 * 24 * 60 * 60 * 1000;

    const expired = isDatabaseTargetTtlExpired({
      createdAt,
      ttlValue: 1,
      ttlUnit: "days",
      now,
    });

    expect(expired).toBe(true);
  });
});

describe("isDatabaseTargetIdleDue", function describeIdle() {
  test("uses last activity timestamp", function testUsesLastActivity() {
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const lastActivityAt = createdAt + 5 * 60 * 1000;
    const now = createdAt + 12 * 60 * 1000;

    const due = isDatabaseTargetIdleDue({
      createdAt,
      lastActivityAt,
      scaleToZeroMinutes: 10,
      now,
    });

    expect(due).toBe(false);
  });

  test("falls back to createdAt when no activity", function testCreatedAtFallback() {
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const now = createdAt + 11 * 60 * 1000;

    const due = isDatabaseTargetIdleDue({
      createdAt,
      lastActivityAt: null,
      scaleToZeroMinutes: 10,
      now,
    });

    expect(due).toBe(true);
  });
});
