import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { shouldTriggerDeploy, verifyWebhookSignature } from "./webhook";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";

  test("accepts valid signature", () => {
    const payload = '{"test": true}';
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  test("rejects invalid signature", () => {
    const payload = '{"test": true}';
    const signature = "sha256=invalid";

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
  });

  test("rejects tampered payload", () => {
    const originalPayload = '{"test": true}';
    const tamperedPayload = '{"test": false}';
    const signature = `sha256=${createHmac("sha256", secret).update(originalPayload).digest("hex")}`;

    expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(
      false,
    );
  });

  test("rejects wrong secret", () => {
    const payload = '{"test": true}';
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyWebhookSignature(payload, signature, "wrong-secret")).toBe(
      false,
    );
  });
});

describe("shouldTriggerDeploy", () => {
  test("returns true for default branch push", () => {
    expect(shouldTriggerDeploy("refs/heads/main", "main")).toBe(true);
    expect(shouldTriggerDeploy("refs/heads/master", "master")).toBe(true);
  });

  test("returns false for non-default branch push", () => {
    expect(shouldTriggerDeploy("refs/heads/feature", "main")).toBe(false);
    expect(shouldTriggerDeploy("refs/heads/develop", "main")).toBe(false);
  });

  test("returns false for tag push", () => {
    expect(shouldTriggerDeploy("refs/tags/v1.0.0", "main")).toBe(false);
  });

  test("handles branch names with slashes", () => {
    expect(
      shouldTriggerDeploy(
        "refs/heads/feature/my-feature",
        "feature/my-feature",
      ),
    ).toBe(true);
    expect(
      shouldTriggerDeploy("refs/heads/feature/other", "feature/my-feature"),
    ).toBe(false);
  });
});
