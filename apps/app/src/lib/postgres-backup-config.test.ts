import { describe, expect, test } from "bun:test";
import {
  getScheduleIntervalMs,
  resolveS3EndpointForProvider,
} from "./postgres-backup-config";

describe("resolveS3EndpointForProvider", () => {
  test("keeps aws endpoint as-is", () => {
    const endpoint = resolveS3EndpointForProvider({
      provider: "aws",
      endpoint: "https://s3.us-east-1.amazonaws.com",
    });

    expect(endpoint).toBe("https://s3.us-east-1.amazonaws.com");
  });

  test("builds cloudflare r2 endpoint from account id", () => {
    const endpoint = resolveS3EndpointForProvider({
      provider: "cloudflare",
      accountId: "abc123",
    });

    expect(endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
  });

  test("builds backblaze endpoint from region", () => {
    const endpoint = resolveS3EndpointForProvider({
      provider: "backblaze",
      region: "us-west-004",
    });

    expect(endpoint).toBe("https://s3.us-west-004.backblazeb2.com");
  });
});

describe("getScheduleIntervalMs", () => {
  test("converts minutes", () => {
    expect(
      getScheduleIntervalMs({
        intervalValue: 5,
        intervalUnit: "minutes",
      }),
    ).toBe(5 * 60 * 1000);
  });

  test("converts hours", () => {
    expect(
      getScheduleIntervalMs({
        intervalValue: 3,
        intervalUnit: "hours",
      }),
    ).toBe(3 * 60 * 60 * 1000);
  });

  test("converts days", () => {
    expect(
      getScheduleIntervalMs({
        intervalValue: 2,
        intervalUnit: "days",
      }),
    ).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
