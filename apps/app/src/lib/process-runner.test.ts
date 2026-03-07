import { describe, expect, test } from "bun:test";
import { runCommand } from "./process-runner";

describe("runCommand", function describeRunCommand() {
  test("times out a long-running process", async function testTimeout() {
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "setTimeout(function holdOpen() {}, 5000)"],
      timeoutMs: 100,
    });

    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("timed out");
  });
});
