export type ObjectStorageErrorCode =
  | "conflict"
  | "not_found"
  | "not_ready"
  | "validation";

export class ObjectStorageError extends Error {
  readonly code: ObjectStorageErrorCode;

  constructor(code: ObjectStorageErrorCode, message: string) {
    super(message);
    this.name = "ObjectStorageError";
    this.code = code;
  }
}

export function objectStorageConflict(message: string): ObjectStorageError {
  return new ObjectStorageError("conflict", message);
}

export function objectStorageNotFound(message: string): ObjectStorageError {
  return new ObjectStorageError("not_found", message);
}

export function objectStorageNotReady(message: string): ObjectStorageError {
  return new ObjectStorageError("not_ready", message);
}

export function objectStorageValidation(message: string): ObjectStorageError {
  return new ObjectStorageError("validation", message);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error ?? "Unknown error");
}
