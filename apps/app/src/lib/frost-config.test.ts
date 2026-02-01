import { describe, expect, test } from "bun:test";
import type { FrostConfig } from "./frost-config";
import { mergeConfigWithService, parseFrostConfig } from "./frost-config";

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

  test("parses deploy.replicas", () => {
    const config = parseFrostConfig("deploy:\n  replicas: 3");
    expect(config.deploy?.replicas).toBe(3);
  });

  test("throws on replicas < 1", () => {
    expect(() => parseFrostConfig("deploy:\n  replicas: 0")).toThrow();
  });

  test("throws on replicas > 10", () => {
    expect(() => parseFrostConfig("deploy:\n  replicas: 11")).toThrow();
  });

  test("parses deploy with replicas + drain_timeout", () => {
    const config = parseFrostConfig(
      "deploy:\n  replicas: 3\n  drain_timeout: 30",
    );
    expect(config.deploy?.replicas).toBe(3);
    expect(config.deploy?.drain_timeout).toBe(30);
  });
});

function makeService(overrides: Record<string, unknown> = {}) {
  return {
    dockerfilePath: "Dockerfile",
    containerPort: 8080,
    healthCheckPath: null as string | null,
    healthCheckTimeout: null as number | null,
    memoryLimit: null as string | null,
    cpuLimit: null as number | null,
    shutdownTimeout: null as number | null,
    drainTimeout: null as number | null,
    replicaCount: 1,
    ...overrides,
  };
}

describe("mergeConfigWithService", () => {
  test("no frost config dockerfile keeps service default", () => {
    const service = makeService();
    const config: FrostConfig = { port: 3000 };
    const result = mergeConfigWithService(service, config);
    expect(result.dockerfilePath).toBe("Dockerfile");
    expect(result.containerPort).toBe(3000);
  });

  test("config.dockerfile used as-is (repo-root-relative)", () => {
    const service = makeService();
    const config: FrostConfig = { dockerfile: "apps/web/Dockerfile" };
    const result = mergeConfigWithService(service, config);
    expect(result.dockerfilePath).toBe("apps/web/Dockerfile");
  });

  test("config.dockerfile overrides service dockerfilePath", () => {
    const service = makeService({ dockerfilePath: "old/Dockerfile" });
    const config: FrostConfig = { dockerfile: "new/Dockerfile.prod" };
    const result = mergeConfigWithService(service, config);
    expect(result.dockerfilePath).toBe("new/Dockerfile.prod");
  });

  test("merges all config fields", () => {
    const service = makeService();
    const config: FrostConfig = {
      dockerfile: "Dockerfile.prod",
      port: 3000,
      health_check: { path: "/health", timeout: 60 },
      resources: { memory: "1g", cpu: 2 },
    };
    const result = mergeConfigWithService(service, config);
    expect(result.dockerfilePath).toBe("Dockerfile.prod");
    expect(result.containerPort).toBe(3000);
    expect(result.healthCheckPath).toBe("/health");
    expect(result.healthCheckTimeout).toBe(60);
    expect(result.memoryLimit).toBe("1g");
    expect(result.cpuLimit).toBe(2);
  });

  test("config.deploy.replicas overrides service replicaCount", () => {
    const service = makeService({ replicaCount: 1 });
    const config: FrostConfig = { deploy: { replicas: 3 } };
    const result = mergeConfigWithService(service, config);
    expect(result.replicaCount).toBe(3);
  });

  test("service replicaCount preserved when config omits replicas", () => {
    const service = makeService({ replicaCount: 1 });
    const config: FrostConfig = { port: 3000 };
    const result = mergeConfigWithService(service, config);
    expect(result.replicaCount).toBe(1);
  });
});
