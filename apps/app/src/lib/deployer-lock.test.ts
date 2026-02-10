import { describe, expect, test } from "bun:test";
import { withServiceDeploymentLock } from "./deployer";

function sleep(ms: number): Promise<void> {
  return new Promise(function onCreate(resolve) {
    setTimeout(resolve, ms);
  });
}

describe("withServiceDeploymentLock", function describeLock() {
  test("serializes tasks for same service", async function testSerialize() {
    const events: string[] = [];

    await Promise.all([
      withServiceDeploymentLock("service-a", async function firstTask() {
        events.push("first:start");
        await sleep(40);
        events.push("first:end");
      }),
      withServiceDeploymentLock("service-a", async function secondTask() {
        events.push("second:start");
        events.push("second:end");
      }),
    ]);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  test("allows parallel tasks for different services", async function testParallel() {
    let running = 0;
    let peak = 0;

    await Promise.all([
      withServiceDeploymentLock("service-a", async function taskA() {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(40);
        running -= 1;
      }),
      withServiceDeploymentLock("service-b", async function taskB() {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(40);
        running -= 1;
      }),
    ]);

    expect(peak).toBe(2);
  });

  test("releases lock after failure", async function testFailure() {
    await expect(
      withServiceDeploymentLock("service-a", async function failingTask() {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    let ran = false;
    await withServiceDeploymentLock("service-a", async function nextTask() {
      ran = true;
    });

    expect(ran).toBe(true);
  });
});
