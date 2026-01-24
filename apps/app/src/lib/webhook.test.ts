import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./webhook";

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
