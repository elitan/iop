import { describe, expect, test } from "bun:test";
import { parseFrostConfig } from "./frost-config";

describe("parseFrostConfig", () => {
  test("parses minimal config", () => {
    const config = parseFrostConfig("port: 3000");
    expect(config.port).toBe(3000);
  });

  test("parses full config", () => {
    const yaml = `
port: 4000
dockerfile: Dockerfile.prod
health_check:
  path: /health
  timeout: 30
resources:
  memory: 512m
  cpu: 0.5
`;
    const config = parseFrostConfig(yaml);
    expect(config.port).toBe(4000);
    expect(config.dockerfile).toBe("Dockerfile.prod");
    expect(config.health_check?.path).toBe("/health");
    expect(config.health_check?.timeout).toBe(30);
    expect(config.resources?.memory).toBe("512m");
    expect(config.resources?.cpu).toBe(0.5);
  });

  test("parses config with only health_check", () => {
    const yaml = `
health_check:
  path: /api/health
`;
    const config = parseFrostConfig(yaml);
    expect(config.health_check?.path).toBe("/api/health");
    expect(config.health_check?.timeout).toBeUndefined();
    expect(config.port).toBeUndefined();
  });

  test("parses config with only resources", () => {
    const yaml = `
resources:
  memory: 1g
  cpu: 2
`;
    const config = parseFrostConfig(yaml);
    expect(config.resources?.memory).toBe("1g");
    expect(config.resources?.cpu).toBe(2);
  });

  test("parses empty config", () => {
    const config = parseFrostConfig("{}");
    expect(config.port).toBeUndefined();
    expect(config.dockerfile).toBeUndefined();
  });

  test("throws on invalid port - too low", () => {
    expect(() => parseFrostConfig("port: 0")).toThrow();
  });

  test("throws on invalid port - too high", () => {
    expect(() => parseFrostConfig("port: 70000")).toThrow();
  });

  test("throws on invalid memory format", () => {
    expect(() => parseFrostConfig("resources:\n  memory: 512mb")).toThrow();
  });

  test("throws on invalid cpu - too low", () => {
    expect(() => parseFrostConfig("resources:\n  cpu: 0.05")).toThrow();
  });

  test("throws on invalid cpu - too high", () => {
    expect(() => parseFrostConfig("resources:\n  cpu: 100")).toThrow();
  });

  test("accepts valid memory formats", () => {
    expect(
      parseFrostConfig("resources:\n  memory: 256k").resources?.memory,
    ).toBe("256k");
    expect(
      parseFrostConfig("resources:\n  memory: 512m").resources?.memory,
    ).toBe("512m");
    expect(parseFrostConfig("resources:\n  memory: 2g").resources?.memory).toBe(
      "2g",
    );
    expect(
      parseFrostConfig("resources:\n  memory: 256K").resources?.memory,
    ).toBe("256K");
    expect(
      parseFrostConfig("resources:\n  memory: 512M").resources?.memory,
    ).toBe("512M");
    expect(parseFrostConfig("resources:\n  memory: 2G").resources?.memory).toBe(
      "2G",
    );
  });

  test("accepts dockerfile path", () => {
    const config = parseFrostConfig("dockerfile: build/Dockerfile.prod");
    expect(config.dockerfile).toBe("build/Dockerfile.prod");
  });

  test("throws on invalid timeout - too low", () => {
    expect(() => parseFrostConfig("health_check:\n  timeout: 0")).toThrow();
  });

  test("throws on invalid timeout - too high", () => {
    expect(() => parseFrostConfig("health_check:\n  timeout: 500")).toThrow();
  });

  test("throws on unknown keys (strict mode)", () => {
    expect(() => parseFrostConfig("unknown_key: value")).toThrow();
  });
});
