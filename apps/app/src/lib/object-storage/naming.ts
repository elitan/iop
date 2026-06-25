import { slugify } from "../slugify";
import { objectStorageValidation } from "./errors";

const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/;
const OBJECT_STORAGE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;

function assertStorageName(name: string): void {
  if (!OBJECT_STORAGE_NAME_PATTERN.test(name)) {
    throw objectStorageValidation(
      "Object storage name must use lowercase letters, numbers, and hyphens only",
    );
  }
}

export function normalizeObjectStorageName(name: string): string {
  const normalized = slugify(name);
  if (normalized.length === 0) {
    throw objectStorageValidation("Object storage name is required");
  }
  const value = normalized.slice(0, 48).replace(/-+$/g, "");
  assertStorageName(value);
  return value;
}

export function normalizeBucketName(name: string): string {
  const normalized = slugify(name).replace(/-+/g, "-");
  const padded =
    normalized.length >= 3 ? normalized : `${normalized || "bucket"}-s3`;
  const value = padded.slice(0, 63).replace(/[.-]+$/g, "");
  if (!BUCKET_NAME_PATTERN.test(value) || value.includes("..")) {
    throw objectStorageValidation(
      "Bucket name must be 3-63 lowercase letters, numbers, dots, or hyphens",
    );
  }
  return value;
}
