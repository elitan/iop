import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

const scryptAsync = promisify(scrypt);

const DEFAULT_SECRET = "frost-default-secret-change-me";
const JWT_SECRET = process.env.FROST_JWT_SECRET || DEFAULT_SECRET;
const SESSION_EXPIRY_DAYS = 7;
const DEV_PASSWORD = "dev";

export function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isAuthEnabled(): boolean {
  return true;
}

export function getDevPassword(): string | null {
  return isDevMode() ? DEV_PASSWORD : null;
}

export async function verifyDevPassword(password: string): Promise<boolean> {
  return isDevMode() && password === DEV_PASSWORD;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;

  const keyBuffer = Buffer.from(key, "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;

  return timingSafeEqual(keyBuffer, derived);
}

interface TokenPayload {
  exp: number;
}

export function createSessionToken(): string {
  const payload: TokenPayload = {
    exp: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSignature(data);
  return `${data}.${signature}`;
}

export function verifySessionToken(token: string): boolean {
  const [data, signature] = token.split(".");
  if (!data || !signature) return false;

  const expectedSignature = createSignature(data);
  if (signature !== expectedSignature) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as TokenPayload;
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function createSignature(data: string): string {
  return createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .selectFrom("settings")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insertInto("settings")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
}

export async function getAdminPasswordHash(): Promise<string | null> {
  return getSetting("admin_password_hash");
}

export async function setAdminPasswordHash(hash: string): Promise<void> {
  return setSetting("admin_password_hash", hash);
}

export async function isSetupComplete(): Promise<boolean> {
  const hash = await getAdminPasswordHash();
  return hash !== null;
}

export function generateApiKey(): string {
  return `frost_${randomBytes(16).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHmac("sha256", JWT_SECRET).update(key).digest("hex");
}

export async function verifyApiToken(token: string): Promise<boolean> {
  const hash = hashApiKey(token);
  const apiKey = await db
    .selectFrom("apiKeys")
    .select("id")
    .where("keyHash", "=", hash)
    .executeTakeFirst();

  if (!apiKey) return false;

  await db
    .updateTable("apiKeys")
    .set({ lastUsedAt: new Date().toISOString() })
    .where("id", "=", apiKey.id)
    .execute();

  return true;
}
