import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildImage,
  runContainer,
  stopContainer,
  waitForHealthy,
} from "./docker";
import {
  createVolume,
  getVolumeSize,
  listFrostVolumes,
  removeVolume,
  volumeExists,
} from "./volumes";

const TEST_IMAGE = "frost-test-health-check:latest";
const TEST_CONTAINER = "frost-test-health-check";
const TEST_PORT = 19999;
const FIXTURE_PATH = join(process.cwd(), "test/fixtures/health-check-app");

describe("health check integration", () => {
  beforeAll(async () => {
    await stopContainer(TEST_CONTAINER);

    const result = await buildImage(FIXTURE_PATH, TEST_IMAGE, "Dockerfile");
    if (!result.success) {
      throw new Error(
        `Failed to build test image: ${result.error}\n${result.log}`,
      );
    }
  }, 60000);

  afterAll(async () => {
    await stopContainer(TEST_CONTAINER);
  });

  test("TCP check succeeds when container is listening", async () => {
    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: TEST_CONTAINER,
    });
    expect(run.success).toBe(true);

    const healthy = await waitForHealthy({
      containerId: run.containerId,
      port: TEST_PORT,
      timeoutSeconds: 30,
    });

    expect(healthy).toBe(true);
    await stopContainer(TEST_CONTAINER);
  }, 60000);

  test("HTTP check succeeds on /health endpoint", async () => {
    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: TEST_CONTAINER,
    });
    expect(run.success).toBe(true);

    const healthy = await waitForHealthy({
      containerId: run.containerId,
      port: TEST_PORT,
      path: "/health",
      timeoutSeconds: 30,
    });

    expect(healthy).toBe(true);
    await stopContainer(TEST_CONTAINER);
  }, 60000);

  test("HTTP check fails on non-existent endpoint", async () => {
    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: TEST_CONTAINER,
    });
    expect(run.success).toBe(true);

    await new Promise((r) => setTimeout(r, 2000));

    const healthy = await waitForHealthy({
      containerId: run.containerId,
      port: TEST_PORT,
      path: "/nonexistent",
      timeoutSeconds: 3,
    });

    expect(healthy).toBe(false);
    await stopContainer(TEST_CONTAINER);
  }, 60000);

  test("TCP check fails on wrong port", async () => {
    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: TEST_CONTAINER,
    });
    expect(run.success).toBe(true);

    const healthy = await waitForHealthy({
      containerId: run.containerId,
      port: TEST_PORT + 1,
      timeoutSeconds: 3,
    });

    expect(healthy).toBe(false);
    await stopContainer(TEST_CONTAINER);
  }, 60000);
});

describe("volume integration", () => {
  const TEST_VOLUME_NAME = "frost-test-volume-integration";

  afterAll(async () => {
    await removeVolume(TEST_VOLUME_NAME);
  });

  test("createVolume creates a volume", async () => {
    await removeVolume(TEST_VOLUME_NAME);

    await createVolume(TEST_VOLUME_NAME);
    const exists = await volumeExists(TEST_VOLUME_NAME);
    expect(exists).toBe(true);
  });

  test("volumeExists returns false for non-existent volume", async () => {
    const exists = await volumeExists("frost-nonexistent-volume-12345");
    expect(exists).toBe(false);
  });

  test("removeVolume removes a volume", async () => {
    await createVolume(TEST_VOLUME_NAME);
    await removeVolume(TEST_VOLUME_NAME);
    const exists = await volumeExists(TEST_VOLUME_NAME);
    expect(exists).toBe(false);
  });

  test("listFrostVolumes returns frost volumes", async () => {
    await createVolume(TEST_VOLUME_NAME);
    const volumes = await listFrostVolumes();
    expect(volumes).toContain(TEST_VOLUME_NAME);
    await removeVolume(TEST_VOLUME_NAME);
  });

  test("runContainer with volumes mounts volume", async () => {
    const volumeName = "frost-test-container-volume";
    await createVolume(volumeName);

    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: TEST_CONTAINER,
      volumes: [{ name: volumeName, path: "/data" }],
    });

    expect(run.success).toBe(true);
    await stopContainer(TEST_CONTAINER);
    await removeVolume(volumeName);
  }, 60000);

  test("getVolumeSize returns size for existing volume", async () => {
    await createVolume(TEST_VOLUME_NAME);
    const size = await getVolumeSize(TEST_VOLUME_NAME);
    expect(typeof size).toBe("number");
    expect(size).toBeGreaterThanOrEqual(0);
    await removeVolume(TEST_VOLUME_NAME);
  });

  test("getVolumeSize returns null for non-existent volume", async () => {
    const size = await getVolumeSize("frost-nonexistent-volume-99999");
    expect(size).toBeNull();
  });
});
