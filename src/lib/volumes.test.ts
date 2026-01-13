import { describe, expect, test } from "bun:test";
import { buildVolumeName, pathToVolumeName } from "./volumes";

describe("volumes", () => {
  test("buildVolumeName creates correct format", () => {
    const name = buildVolumeName("abc123", "data");
    expect(name).toBe("frost-abc123-data");
  });

  test("buildVolumeName handles different volume names", () => {
    expect(buildVolumeName("svc1", "data")).toBe("frost-svc1-data");
    expect(buildVolumeName("svc2", "logs")).toBe("frost-svc2-logs");
    expect(buildVolumeName("my-service", "db")).toBe("frost-my-service-db");
  });

  test("buildVolumeName with nanoid-like service IDs", () => {
    const name = buildVolumeName("V1StGXR8_Z5jdHi6B-myT", "data");
    expect(name).toBe("frost-V1StGXR8_Z5jdHi6B-myT-data");
  });

  test("pathToVolumeName converts simple path", () => {
    expect(pathToVolumeName("/data")).toBe("data");
  });

  test("pathToVolumeName converts nested path", () => {
    expect(pathToVolumeName("/var/lib/postgres")).toBe("var-lib-postgres");
  });

  test("pathToVolumeName converts app uploads path", () => {
    expect(pathToVolumeName("/app/uploads")).toBe("app-uploads");
  });
});
