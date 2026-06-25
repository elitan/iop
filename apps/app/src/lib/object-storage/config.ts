export const GARAGE_IMAGE =
  process.env.FROST_OBJECT_STORAGE_GARAGE_IMAGE ?? "dxflrs/garage:v2.3.0";
export const GARAGE_S3_PORT = 3900;
export const GARAGE_REGION = "auto";
export const GARAGE_PROVISION_TIMEOUT_MS = 120000;

export function getObjectStorageClientRegion(region: string): string {
  if (region === "garage") {
    return GARAGE_REGION;
  }
  return region;
}

export function getObjectStorageSigningRegion(region: string): string {
  return region;
}
