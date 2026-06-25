"use client";

import type { ContractOutputs } from "@/contracts";
import type { Service } from "@/lib/api";
import { DatabaseCard } from "./database-card";
import type { CanvasDatabase } from "./database-content";
import { ObjectStorageCard } from "./object-storage-card";
import { ServiceCard } from "./service-card";

type ObjectStorage = ContractOutputs["objectStorages"]["list"][number];

interface EnvironmentResourceSectionsProps {
  projectId: string;
  services: Service[];
  databases: CanvasDatabase[];
  objectStorages: ObjectStorage[];
  domains: Record<string, string>;
  serverIp: string | null;
  onOpenDatabase: (databaseId: string) => void;
}

export function getEnvironmentObjectStorages(
  objectStorages: ObjectStorage[],
  environmentId: string,
): ObjectStorage[] {
  return objectStorages.filter(function byEnvironment(objectStorage) {
    return objectStorage.environmentId === environmentId;
  });
}

export function hasEnvironmentResources(input: {
  services: Service[];
  databases: CanvasDatabase[];
  objectStorages: ObjectStorage[];
}): boolean {
  return (
    input.services.length > 0 ||
    input.databases.length > 0 ||
    input.objectStorages.length > 0
  );
}

export function EnvironmentResourceSections({
  projectId,
  services,
  databases,
  objectStorages,
  domains,
  serverIp,
  onOpenDatabase,
}: EnvironmentResourceSectionsProps) {
  return (
    <div className="space-y-6">
      {services.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Services
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map(function renderService(service) {
              return (
                <ServiceCard
                  key={service.id}
                  service={service}
                  projectId={projectId}
                  domain={domains[service.id] ?? null}
                  serverIp={serverIp}
                />
              );
            })}
          </div>
        </section>
      )}

      {databases.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Databases
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {databases.map(function renderDatabase(database) {
              return (
                <DatabaseCard
                  key={database.id}
                  database={database}
                  onOpen={onOpenDatabase}
                />
              );
            })}
          </div>
        </section>
      )}

      {objectStorages.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Object Storage
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {objectStorages.map(function renderObjectStorage(objectStorage) {
              return (
                <ObjectStorageCard
                  key={objectStorage.id}
                  objectStorage={objectStorage}
                  projectId={projectId}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
