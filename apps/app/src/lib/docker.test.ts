import { describe, expect, test } from "bun:test";
import { getDatabaseTargetReservedPorts } from "./docker";

describe("getDatabaseTargetReservedPorts", function describeReservedPorts() {
  test("returns provider and runtime host ports", function testReservedPorts() {
    const ports = getDatabaseTargetReservedPorts({
      providerRefJson: JSON.stringify({
        containerName: "frost-db-test-main",
        hostPort: 10001,
        runtimeHostPort: 10002,
      }),
      runtimeHostPort: 10003,
    });

    expect(ports.sort()).toEqual([10001, 10002, 10003]);
  });

  test("deduplicates repeated ports", function testDeduplicatePorts() {
    const ports = getDatabaseTargetReservedPorts({
      providerRefJson: JSON.stringify({
        containerName: "frost-db-test-main",
        hostPort: 10001,
        runtimeHostPort: 10001,
      }),
      runtimeHostPort: 10001,
    });

    expect(ports).toEqual([10001]);
  });

  test("ignores malformed provider refs", function testMalformedProviderRef() {
    const ports = getDatabaseTargetReservedPorts({
      providerRefJson: "{not-json",
      runtimeHostPort: 10003,
    });

    expect(ports).toEqual([10003]);
  });
});
