import { describe, expect, test } from "bun:test";
import { buildContainerCommandOptions } from "./container-command";

describe("buildContainerCommandOptions", () => {
  test("does not override image defaults without a custom command", () => {
    expect(buildContainerCommandOptions(null)).toEqual({});
    expect(buildContainerCommandOptions(undefined)).toEqual({});
  });

  test("runs custom commands through a shell entrypoint", () => {
    expect(buildContainerCommandOptions("echo hello && echo done")).toEqual({
      entrypoint: "/bin/sh",
      command: ["-c", "echo hello && echo done"],
    });
  });
});
