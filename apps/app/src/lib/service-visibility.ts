import type { Selectable } from "kysely";
import type { Services } from "./db-types";

export type ServiceType = Selectable<Services>["serviceType"];
export type UserFacingServiceType = Exclude<ServiceType, "object-storage">;

export const USER_FACING_SERVICE_TYPES: UserFacingServiceType[] = [
  "app",
  "database",
];

const USER_FACING_SERVICE_TYPE_SET: ReadonlySet<ServiceType> = new Set(
  USER_FACING_SERVICE_TYPES,
);

export function isUserFacingServiceType(
  serviceType: ServiceType,
): serviceType is UserFacingServiceType {
  return USER_FACING_SERVICE_TYPE_SET.has(serviceType);
}

export function assertUserFacingServiceType<
  T extends { serviceType: ServiceType },
>(service: T): asserts service is T & { serviceType: UserFacingServiceType } {
  if (!isUserFacingServiceType(service.serviceType)) {
    throw new Error("Service not found");
  }
}
