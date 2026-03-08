import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { buildPRCommentBody, verifyWebhookSignature } from "./webhook";

const STATUS_ICON_BASE_URL = "https://frost.build/static/status";
const SERVICE_DASHBOARD_URL =
  "https://demo.frost.build/projects/proj_123/environments/env_123/services/svc_123";

function buildCommentBodyForTest(
  status: string,
  previewUrl: string | null = null,
  frostDomain: string | null = "demo.frost.build",
): string {
  return buildPRCommentBody({
    services: [
      {
        id: "svc_123",
        name: "frost",
        hostname: "frost",
        status,
        url: previewUrl,
      },
    ],
    projectId: "proj_123",
    environmentId: "env_123",
    frostDomain,
  });
}

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

describe("buildPRCommentBody", () => {
  test("renders ready status with plain circle and linked text", () => {
    const body = buildCommentBodyForTest(
      "running",
      "https://preview.example.com",
    );

    expect(body).toContain(
      `![](${STATUS_ICON_BASE_URL}/ready-dot.svg) [Ready](${SERVICE_DASHBOARD_URL})`,
    );
    expect(body).toContain("[Visit](https://preview.example.com)");
  });

  test("renders failed status with linked text", () => {
    const body = buildCommentBodyForTest("failed");

    expect(body).toContain(
      `![](${STATUS_ICON_BASE_URL}/failed-dot.svg) [Failed](${SERVICE_DASHBOARD_URL})`,
    );
  });

  test("renders building status with linked text", () => {
    const body = buildCommentBodyForTest("pending");

    expect(body).toContain(
      `![](${STATUS_ICON_BASE_URL}/building-dot.svg) [Building](${SERVICE_DASHBOARD_URL})`,
    );
  });

  test("renders plain status text when dashboard url is missing", () => {
    const body = buildCommentBodyForTest("running", null, null);

    expect(body).toContain(
      `| frost | ![](${STATUS_ICON_BASE_URL}/ready-dot.svg) Ready | - |`,
    );
    expect(body).not.toContain("[Ready](");
  });
});
