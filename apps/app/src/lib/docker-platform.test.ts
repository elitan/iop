import { describe, expect, test } from "bun:test";

import {
  classifyPullFailure,
  isTransientContainerStartError,
  normalizeDockerArch,
  normalizeDockerPlatform,
} from "./docker";

describe("normalizeDockerArch", () => {
  test("normalizes amd64 variants", () => {
    expect(normalizeDockerArch("amd64")).toBe("amd64");
    expect(normalizeDockerArch("x86_64")).toBe("amd64");
    expect(normalizeDockerArch("x64")).toBe("amd64");
  });

  test("normalizes arm64 variants", () => {
    expect(normalizeDockerArch("arm64")).toBe("arm64");
    expect(normalizeDockerArch("aarch64")).toBe("arm64");
    expect(normalizeDockerArch("arm64/v8")).toBe("arm64");
  });
});

describe("normalizeDockerPlatform", () => {
  test("normalizes platform values", () => {
    expect(normalizeDockerPlatform("linux/aarch64")).toBe("linux/arm64");
    expect(normalizeDockerPlatform("linux/x86_64")).toBe("linux/amd64");
  });
});

describe("classifyPullFailure", () => {
  test("classifies platform mismatch", () => {
    const message =
      "no matching manifest for linux/arm64/v8 in the manifest list entries";
    expect(classifyPullFailure(message)).toBe("image/platform-mismatch");
  });

  test("classifies image not found", () => {
    expect(classifyPullFailure("manifest unknown")).toBe("image/not-found");
  });
});

describe("isTransientContainerStartError", () => {
  test("detects docker daemon task create eofs", () => {
    const message =
      "failed to create task for container: Unavailable: error reading from server: EOF";
    expect(isTransientContainerStartError(message)).toBe(true);
  });

  test("detects systemd message bus disconnects", () => {
    const message =
      "unable to start unit: Message recipient disconnected from message bus without replying";
    expect(isTransientContainerStartError(message)).toBe(true);
  });

  test("returns false for non transient errors", () => {
    expect(isTransientContainerStartError("invalid reference format")).toBe(
      false,
    );
  });
});
