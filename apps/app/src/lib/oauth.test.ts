import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  generateAccessToken,
  generateCode,
  generateRefreshToken,
  getAccessTokenExpiry,
  getAccessTokenTtlSeconds,
  hashOAuthToken,
  verifyPKCE,
} from "./oauth";

describe("oauth", () => {
  describe("generateCode", () => {
    test("produces 64 char hex string", () => {
      const code = generateCode();
      expect(code).toHaveLength(64);
      expect(code).toMatch(/^[a-f0-9]{64}$/);
    });

    test("produces unique values", () => {
      const a = generateCode();
      const b = generateCode();
      expect(a).not.toBe(b);
    });
  });

  describe("generateAccessToken", () => {
    test("has frost_at_ prefix", () => {
      const token = generateAccessToken();
      expect(token.startsWith("frost_at_")).toBe(true);
    });

    test("is long enough to be secure", () => {
      const token = generateAccessToken();
      expect(token.length).toBeGreaterThan(40);
    });
  });

  describe("generateRefreshToken", () => {
    test("has frost_rt_ prefix", () => {
      const token = generateRefreshToken();
      expect(token.startsWith("frost_rt_")).toBe(true);
    });
  });

  describe("access token ttl", () => {
    test("returns positive ttl seconds", () => {
      const ttlSeconds = getAccessTokenTtlSeconds();
      expect(ttlSeconds).toBeGreaterThan(0);
    });

    test("expiry is in the future", () => {
      const expiryMs = new Date(getAccessTokenExpiry()).getTime();
      expect(expiryMs).toBeGreaterThan(Date.now());
    });
  });

  describe("hashOAuthToken", () => {
    test("produces consistent hashes", () => {
      const token = "test-token-123";
      expect(hashOAuthToken(token)).toBe(hashOAuthToken(token));
    });

    test("different inputs produce different hashes", () => {
      expect(hashOAuthToken("token-a")).not.toBe(hashOAuthToken("token-b"));
    });

    test("produces hex string", () => {
      expect(hashOAuthToken("test")).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("verifyPKCE", () => {
    test("returns true for valid S256 pair", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    test("returns false for wrong verifier", () => {
      const verifier = "correct-verifier";
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(verifyPKCE("wrong-verifier", challenge)).toBe(false);
    });

    test("returns false for tampered challenge", () => {
      const verifier = "my-verifier";
      expect(verifyPKCE(verifier, "tampered-challenge")).toBe(false);
    });
  });
});
