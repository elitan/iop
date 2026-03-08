import { describe, expect, test } from "bun:test";
import { getDatabaseTargetStatus } from "./database-target-status";

describe("getDatabaseTargetStatus", function describeDatabaseTargetStatus() {
  test("returns active status", function testActiveStatus() {
    expect(
      getDatabaseTargetStatus({
        name: "feature-a",
        lifecycleStatus: "active",
        stoppedReason: null,
        scaleToZeroMinutes: null,
      }),
    ).toEqual({
      label: "active",
      tone: "success",
      helperText: null,
    });
  });

  test("returns sleeping status for idle stopped branches", function testSleepingStatus() {
    expect(
      getDatabaseTargetStatus({
        name: "feature-a",
        lifecycleStatus: "stopped",
        stoppedReason: "idle",
        scaleToZeroMinutes: 10,
      }),
    ).toEqual({
      label: "sleeping",
      tone: "info",
      helperText: "wakes on next connection",
    });
  });

  test("returns failed status for failed targets", function testFailedStatus() {
    expect(
      getDatabaseTargetStatus({
        name: "feature-a",
        lifecycleStatus: "stopped",
        stoppedReason: "failed",
        scaleToZeroMinutes: null,
      }),
    ).toEqual({
      label: "failed",
      tone: "danger",
      helperText: "last start failed. try restart",
    });
  });

  test("returns stopped fallback", function testStoppedFallback() {
    expect(
      getDatabaseTargetStatus({
        name: "feature-a",
        lifecycleStatus: "stopped",
        stoppedReason: null,
        scaleToZeroMinutes: null,
      }),
    ).toEqual({
      label: "stopped",
      tone: "neutral",
      helperText: "not running",
    });
  });

  test("returns expired status", function testExpiredStatus() {
    expect(
      getDatabaseTargetStatus({
        name: "feature-a",
        lifecycleStatus: "expired",
        stoppedReason: null,
        scaleToZeroMinutes: null,
      }),
    ).toEqual({
      label: "expired",
      tone: "danger",
      helperText: null,
    });
  });

  test("never shows main as sleeping", function testMainNeverSleeping() {
    expect(
      getDatabaseTargetStatus({
        name: "main",
        lifecycleStatus: "stopped",
        stoppedReason: "idle",
        scaleToZeroMinutes: null,
      }),
    ).toEqual({
      label: "stopped",
      tone: "neutral",
      helperText: "not running",
    });
  });
});
