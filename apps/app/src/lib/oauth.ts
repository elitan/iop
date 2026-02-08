import { createHash, createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { getRequiredJwtSecret } from "./jwt-secret";

const AUTH_CODE_EXPIRY_MS = 10 * 60 * 1000;

export function generateCode(): string {
  return randomBytes(32).toString("hex");
}

export function generateAccessToken(): string {
  return `frost_at_${randomBytes(32).toString("hex")}`;
}

export function generateRefreshToken(): string {
  return `frost_rt_${randomBytes(32).toString("hex")}`;
}

export function hashOAuthToken(token: string): string {
  return createHmac("sha256", getRequiredJwtSecret())
    .update(token)
    .digest("hex");
}

export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
): boolean {
  const digest = createHash("sha256").update(codeVerifier).digest("base64url");
  return digest === codeChallenge;
}

export async function verifyOAuthToken(token: string): Promise<boolean> {
  const hash = hashOAuthToken(token);
  const record = await db
    .selectFrom("oauthTokens")
    .select("id")
    .where("accessTokenHash", "=", hash)
    .executeTakeFirst();

  return !!record;
}

export function getAccessTokenExpiry(): string {
  return new Date("9999-12-31T23:59:59.999Z").toISOString();
}

export function getAuthCodeExpiry(): string {
  return new Date(Date.now() + AUTH_CODE_EXPIRY_MS).toISOString();
}

export async function parseOAuthBody(
  request: Request,
): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries()) as Record<string, string>;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}
