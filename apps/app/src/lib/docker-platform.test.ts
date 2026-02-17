import { describe, expect, test } from "bun:test";

import {
  classifyPullFailure,
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
