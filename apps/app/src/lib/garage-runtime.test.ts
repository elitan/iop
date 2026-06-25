import { describe, expect, test } from "bun:test";
import { buildGarageConfigContent, isGarageImage } from "./garage-runtime";

describe("buildGarageConfigContent", function describeGarageConfig() {
  test("exposes Garage auxiliary listeners on the project network", function testGarageListeners() {
    const content = buildGarageConfigContent();

    expect(content).toContain('rpc_bind_addr = "[::]:3901"');
    expect(content).toContain('bind_addr = "[::]:3902"');
    expect(content).toContain('api_bind_addr = "[::]:3903"');
  });

  test("uses generated environment tokens instead of hardcoded admin tokens", function testGarageTokens() {
    const content = buildGarageConfigContent();

    expect(content).not.toContain("unused-admin-token");
    expect(content).not.toContain("unused-metrics-token");
    expect(content).not.toContain("admin_token =");
    expect(content).not.toContain("metrics_token =");
  });
});

describe("isGarageImage", function describeGarageImageDetection() {
  test("matches supported Garage image names", function testGarageImages() {
    expect(isGarageImage("dxflrs/garage")).toBe(true);
    expect(isGarageImage("dxflrs/garage:v2.3.0")).toBe(true);
    expect(isGarageImage("docker.io/dxflrs/garage")).toBe(true);
    expect(isGarageImage("docker.io/dxflrs/garage:v2.3.0")).toBe(true);
  });

  test("ignores non-Garage image names", function testNonGarageImages() {
    expect(isGarageImage(null)).toBe(false);
    expect(isGarageImage("myorg/garage-dashboard")).toBe(false);
    expect(isGarageImage("minio/minio")).toBe(false);
  });
});
