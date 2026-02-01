import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { exec } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildImage,
  createNetwork,
  gracefulStopContainer,
  removeNetwork,
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

const execAsync = promisify(exec);

const TEST_IMAGE = "frost-test-health-check:latest";
const TEST_CONTAINER = "frost-test-health-check";
const TEST_PORT = 19999;
const REPO_ROOT = process.cwd();
const DOCKERFILE_PATH = "test/fixtures/health-check-app/Dockerfile";

describe("health check integration", () => {
  beforeAll(async () => {
    await stopContainer(TEST_CONTAINER);

    const result = await buildImage({
      repoPath: REPO_ROOT,
      imageName: TEST_IMAGE,
      dockerfilePath: DOCKERFILE_PATH,
    });
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

const GRACEFUL_IMAGE = "frost-test-graceful-app:latest";
const GRACEFUL_BUILD_DIR = join(REPO_ROOT, "test/fixtures/graceful-app");

describe("graceful stop", () => {
  const CONTAINER_A = "frost-test-graceful-a";
  const CONTAINER_B = "frost-test-graceful-b";
  const PORT_A = 19997;
  const PORT_B = 19996;

  beforeAll(async () => {
    await stopContainer(CONTAINER_A);
    await stopContainer(CONTAINER_B);
    const result = await buildImage({
      repoPath: GRACEFUL_BUILD_DIR,
      imageName: GRACEFUL_IMAGE,
    });
    if (!result.success) {
      throw new Error(
        `Failed to build graceful image: ${result.error}\n${result.log}`,
      );
    }
  }, 60000);

  afterAll(async () => {
    await stopContainer(CONTAINER_A);
    await stopContainer(CONTAINER_B);
  });

  test("gracefulStopContainer sends SIGTERM before SIGKILL", async () => {
    const run = await runContainer({
      imageName: GRACEFUL_IMAGE,
      hostPort: PORT_A,
      containerPort: 8080,
      name: CONTAINER_A,
    });
    expect(run.success).toBe(true);

    const healthy = await waitForHealthy({
      containerId: run.containerId,
      port: PORT_A,
      path: "/health",
      timeoutSeconds: 15,
    });
    expect(healthy).toBe(true);

    const { stdout: logsBefore } = await execAsync(
      `docker logs ${run.containerId} 2>&1`,
    ).catch(() => ({ stdout: "" }));
    expect(logsBefore).toContain("Graceful app running on port");

    await execAsync(`docker stop --time 10 ${CONTAINER_A}`);

    const { stdout: logs } = await execAsync(
      `docker logs ${run.containerId} 2>&1`,
    ).catch(() => ({ stdout: "" }));
    expect(logs).toContain("SIGTERM received");

    await execAsync(`docker rm ${CONTAINER_A}`).catch(() => {});
  }, 60000);

  test("two containers with same alias both resolve", async () => {
    const networkName = "frost-test-dns-rr";
    await createNetwork(networkName, {});

    const runA = await runContainer({
      imageName: GRACEFUL_IMAGE,
      hostPort: PORT_A,
      containerPort: 8080,
      name: CONTAINER_A,
      network: networkName,
      networkAlias: "test-svc.frost.internal",
    });
    expect(runA.success).toBe(true);

    const runB = await runContainer({
      imageName: GRACEFUL_IMAGE,
      hostPort: PORT_B,
      containerPort: 8080,
      name: CONTAINER_B,
      network: networkName,
      networkAlias: "test-svc.frost.internal",
    });
    expect(runB.success).toBe(true);

    await waitForHealthy({
      containerId: runA.containerId,
      port: PORT_A,
      path: "/health",
      timeoutSeconds: 15,
    });
    await waitForHealthy({
      containerId: runB.containerId,
      port: PORT_B,
      path: "/health",
      timeoutSeconds: 15,
    });

    const resA = await fetch(`http://127.0.0.1:${PORT_A}/`);
    expect(resA.ok).toBe(true);
    const resB = await fetch(`http://127.0.0.1:${PORT_B}/`);
    expect(resB.ok).toBe(true);

    await gracefulStopContainer(CONTAINER_A, 5);

    const resB2 = await fetch(`http://127.0.0.1:${PORT_B}/`);
    expect(resB2.ok).toBe(true);

    await stopContainer(CONTAINER_B);
    await removeNetwork(networkName);
  }, 60000);
});

describe("network alias integration", () => {
  const NETWORK_NAME = "frost-test-network-alias";
  const CONTAINER_NAME = "frost-test-alias-container";

  beforeAll(async () => {
    await stopContainer(CONTAINER_NAME);
    await createNetwork(NETWORK_NAME, {});
  }, 30000);

  afterAll(async () => {
    await stopContainer(CONTAINER_NAME);
    await removeNetwork(NETWORK_NAME);
  });

  test("runContainer with networkAlias sets alias on network", async () => {
    const run = await runContainer({
      imageName: TEST_IMAGE,
      hostPort: TEST_PORT,
      containerPort: 8080,
      name: CONTAINER_NAME,
      network: NETWORK_NAME,
      networkAlias: "my-service",
    });
    expect(run.success).toBe(true);

    const { stdout } = await execAsync(
      `docker inspect ${CONTAINER_NAME} --format '{{json .NetworkSettings.Networks}}'`,
    );
    const networks = JSON.parse(stdout.trim());
    const aliases = networks[NETWORK_NAME]?.Aliases || [];
    expect(aliases).toContain("my-service");
    await stopContainer(CONTAINER_NAME);
  }, 60000);
});
